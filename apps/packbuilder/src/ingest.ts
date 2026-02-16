/**
 * Single-compound ingestion: resolve RxCUI, enrich, persist to robust schema.
 * All tables key off compound.id (uuid); compound.rxcui is unique for lookups.
 */

import { getSupabaseServiceRole } from "database";
import * as rxnorm from "./rxnorm.js";
import * as dailymed from "./dailymed.js";
import type { LabelSnippetInput } from "./dailymed.js";
import * as pubchem from "./pubchem.js";
import * as fda from "./fda.js";
import * as pubmed from "./pubmed.js";
import * as chembl from "./chembl.js";
import { extractPharmacokineticsFromText } from "pharma-ai";
import * as atc from "./atc.js";
import * as clinicaltrials from "./clinicaltrials.js";
import * as ndc from "./ndc.js";
import { resolveDrugName } from "./resolveDrugName.js";

const SECTION_TYPE_MAP: Record<string, string> = {
  description: "description",
  indications_and_usage: "indication",
  warnings: "warning",
  contraindications: "contraindication",
  adverse_reactions: "adverse_reaction",
  mechanism_of_action: "mechanism",
  clinical_pharmacology: "mechanism",
  dosage_and_administration: "mechanism",
  drug_interactions: "mechanism",
  pregnancy: "mechanism",
  purpose: "indication",
};

function inferPrimaryClass(text: string): string | null {
  if (!text) return null;
  const m = text.match(/(?:GLP-1|GIP|GLP-1\/GIP|SGLT2|DPP-4|biguanide|androgen|SERM|estrogen|agonist|antagonist|inhibitor|modulator)[^\.,]*/i);
  if (m) return m[0].trim().slice(0, 120);
  const first = text.split(/[.\n]/)[0]?.trim();
  return first && first.length < 120 ? first : null;
}

function inferMoleculeType(mw: number | null | undefined): string | null {
  if (mw == null) return null;
  if (mw > 2000) return "peptide";
  if (mw > 10000) return "biologic";
  return "small_molecule";
}

function extractKineticsFromSnippets(snippets: LabelSnippetInput[]): {
  pharmacokinetics: Record<string, unknown>;
  pharmacodynamics: Record<string, unknown>;
} {
  const pk: Record<string, unknown> = {};
  const pd: Record<string, unknown> = {};
  const full = snippets.map((s) => s.text).join(" ");
  const halfLifeMatch = full.match(/(?:half[- ]?life|t\s*?½|t½)\s*[:\s]*(\d+(?:\.\d+)?)\s*(?:days?|hours?|h|d)/i);
  if (halfLifeMatch) pk.half_life_hours = parseFloat(halfLifeMatch[1]) * (halfLifeMatch[0].toLowerCase().includes("day") ? 24 : 1);
  if (/\bproteolytic\b/i.test(full)) pk.metabolism = "proteolytic degradation";
  if (/\bCYP\s*\d+/i.test(full)) pk.metabolism = full.match(/CYP\s*\d+[a-z]*/i)?.[0] ?? "hepatic";
  if (/\bblood[- ]?brain\b|\bBBB\b|CNS\s*penetr/i.test(full)) pk.blood_brain_barrier = full.match(/minimal|limited|poor|low|yes|no/i)?.[0]?.toLowerCase() ?? "unknown";
  const mechanismSnippet = snippets.find((s) => /mechanism|pharmacology|clinical/i.test(s.section))?.text ?? "";
  if (mechanismSnippet) {
    pd.primary_effect = mechanismSnippet.slice(0, 500);
  }
  return { pharmacokinetics: pk, pharmacodynamics: pd };
}

function buildClinicalProfile(snippets: LabelSnippetInput[], usesSummary: string | null): Record<string, unknown> {
  const indicationSnippet = snippets.find((s) => /indication|use/i.test(s.section))?.text ?? usesSummary ?? "";
  const approved: string[] = [];
  const m = indicationSnippet.match(/(?:indicated for|used for|approval for)\s*[:\s]*([^.]+)/i);
  if (m) approved.push(...m[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 5));
  const contraSnippet = snippets.find((s) => /contraindication/i.test(s.section))?.text ?? "";
  const contraindications: string[] = [];
  if (contraSnippet) contraindications.push(...contraSnippet.split(/[,.]/).map((s) => s.trim()).filter((s) => s.length > 3).slice(0, 8));
  return {
    approved_indications: approved.length ? approved : (usesSummary ? [usesSummary.slice(0, 200)] : []),
    common_off_label: [],
    onset_days: null,
    monitoring: [],
    contraindications: contraindications.length ? contraindications : [],
  };
}

function buildAdverseFrequency(snippets: LabelSnippetInput[], safetySummary: string | null): Record<string, string> {
  const adverse: Record<string, string> = {};
  const snippet = snippets.find((s) => /adverse|reaction/i.test(s.section))?.text ?? safetySummary ?? "";
  if (!snippet) return adverse;
  const lower = snippet.toLowerCase();
  for (const [term, freq] of [
    ["nausea", "common"],
    ["vomiting", "common"],
    ["diarrhea", "common"],
    ["headache", "common"],
    ["hypoglycemia", "common"],
    ["pancreatitis", "rare"],
    ["injection", "common"],
  ]) {
    if (lower.includes(term)) adverse[term] = freq;
  }
  return adverse;
}

function inferDeckTags(primaryClass: string | null, usesSummary: string | null): string[] {
  const tags = new Set<string>();
  const text = `${primaryClass ?? ""} ${usesSummary ?? ""}`.toLowerCase();
  if (/\bGLP-1|glucagon|insulin|diabet|weight|obesity|metabolic\b/i.test(text)) tags.add("metabolic");
  if (/\bCNS|brain|cognitive|neuro\b/i.test(text)) tags.add("cognitive");
  if (/\bhormone|testosterone|estrogen|thyroid|endocrine\b/i.test(text)) tags.add("endocrine");
  if (/\bagonist|antagonist|receptor\b/i.test(text)) tags.add("receptor");
  return Array.from(tags);
}

/** Get or create global source_reference row; return id for edge provenance. */
async function getOrCreateSourceRef(
  supabase: ReturnType<typeof getSupabaseServiceRole>,
  source_type: string,
  url: string | null = null,
  title: string | null = null
): Promise<string | null> {
  if (!supabase) return null;
  let q = supabase.from("source_reference").select("id").eq("source_type", source_type);
  if (url != null && url !== "") q = q.eq("url", url);
  else q = q.is("url", null);
  const { data: existing } = await q.limit(1).maybeSingle();
  if (existing?.id) return existing.id;
  const { data: inserted } = await supabase
    .from("source_reference")
    .insert({
      source_type,
      url: url ?? null,
      title: title ?? null,
      retrieved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return inserted?.id ?? null;
}

/** Extract candidate drug names from drug_interactions section text for DDI resolution. */
function parseDrugInteractionCandidates(text: string): string[] {
  if (!text?.trim()) return [];
  const names = new Set<string>();
  const lines = text.split(/\n+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 2) continue;
    const colon = trimmed.indexOf(":");
    const openParen = trimmed.indexOf("(");
    let name: string;
    if (colon > 0) {
      name = trimmed.slice(0, colon).trim();
    } else if (openParen > 0) {
      name = trimmed.slice(0, openParen).trim();
    } else {
      const m = trimmed.match(/^(?:concomitant\s+use\s+of\s+)?([A-Za-z][A-Za-z0-9\s\-]+?)(?:\s+may|\s+can|\s+should|$)/i);
      name = m ? m[1].trim() : trimmed.slice(0, 80).trim();
    }
    if (name && name.length >= 2 && name.length <= 120 && !/^(major|moderate|minor|see|avoid|use)\b/i.test(name)) {
      names.add(name.replace(/\s+/g, " ").trim());
    }
  }
  return Array.from(names).slice(0, 30);
}

function inferSeverity(text: string): "major" | "moderate" | "minor" | "unknown" {
  const lower = text.toLowerCase();
  if (/\bmajor\b|contraindicated|avoid\s+combination\b/.test(lower)) return "major";
  if (/\bmoderate\b|caution\b|monitor\b/.test(lower)) return "moderate";
  if (/\bminor\b/.test(lower)) return "minor";
  return "unknown";
}

function buildDeckStats(primaryClass: string | null, moleculeType: string | null): Record<string, number> {
  const stats: Record<string, number> = {};
  if (primaryClass) {
    if (/GLP-1|GIP|tirzepatide|semaglutide/i.test(primaryClass)) {
      stats.metabolic_score = 90;
      stats.adoption_score = 88;
      stats.trend_score = 92;
    }
    if (/androgen|testosterone|SERM/i.test(primaryClass)) {
      stats.metabolic_score = 50;
      stats.cns_activity_score = 30;
    }
  }
  if (moleculeType === "peptide") stats.rarity_score = 70;
  else if (moleculeType === "small_molecule") stats.rarity_score = 40;
  return stats;
}

export interface IngestResult {
  rxcui: string;
  canonical_name: string;
  ok: boolean;
  error?: string;
}

export async function ingestCompound(inputName: string): Promise<IngestResult> {
  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    return { rxcui: "", canonical_name: inputName, ok: false, error: "Supabase URL and service role key must be set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) for ingest. The anon key cannot write to compound." };
  }

  const rxcui = await rxnorm.findRxcuiByString(inputName);
  if (!rxcui) {
    return { rxcui: "", canonical_name: inputName, ok: false, error: "RxCUI not found" };
  }

  const canonical_name = (await rxnorm.getConceptName(rxcui)) ?? inputName;
  const normalized_name = canonical_name.toLowerCase().replace(/\s+/g, " ").trim();
  const [synonyms, related, labelSnippets, pubchemResult] = await Promise.all([
    rxnorm.getSynonyms(rxcui),
    rxnorm.getRelatedConcepts(rxcui),
    dailymed.fetchLabelSnippetsForRxcui(rxcui, canonical_name),
    pubchem.fetchPubChemForRxcui(rxcui, canonical_name),
  ]);

  const mechanismSummary = labelSnippets.find((s) =>
    /mechanism|pharmacology|clinical pharmacology/i.test(s.section)
  )?.text ?? null;
  const usesSummary = labelSnippets.find((s) =>
    /indication|use|disease/i.test(s.section)
  )?.text ?? null;
  const safetySummary = labelSnippets.find((s) =>
    /warning|precaution|adverse|contraindication/i.test(s.section)
  )?.text ?? null;
  const sourceLinks = ["https://dailymed.nlm.nih.gov/", "https://open.fda.gov/"];

  try {
    const { data: compoundRow, error: compoundError } = await supabase
      .from("compound")
      .upsert(
        { rxcui, canonical_name, normalized_name, status: "active" },
        { onConflict: "rxcui" }
      )
      .select("id")
      .single();

    if (compoundError) {
      throw new Error(`compound: ${compoundError.message ?? JSON.stringify(compoundError)}`);
    }
    if (!compoundRow) throw new Error("compound: no row returned");
    const compound_id = compoundRow.id;

    await supabase
      .from("compound_identifier")
      .upsert({ compound_id, id_type: "rxcui", id_value: rxcui, source: "rxnorm" }, { onConflict: "compound_id,id_type" });

    await supabase.from("compound_synonym").delete().eq("compound_id", compound_id);
    if (synonyms.length > 0) {
      await supabase.from("compound_synonym").insert(
        synonyms.slice(0, 50).map((synonym) => ({
          compound_id,
          synonym,
          source: "rxnorm",
          is_preferred: false,
        }))
      );
    }

    if (related.length > 0) {
      const relatedRxcuis = [...new Set(related.map((c) => c.rxcui).filter((x) => x !== rxcui))].slice(0, 100);
      const { data: existing } = await supabase
        .from("compound")
        .select("id, rxcui")
        .in("rxcui", relatedRxcuis);
      const rxcuiToId = new Map((existing ?? []).map((r) => [r.rxcui, r.id]));
      await supabase.from("compound_relation").delete().eq("compound_id_from", compound_id);
      const toInsert = related
        .filter((c) => c.rxcui !== rxcui && rxcuiToId.has(c.rxcui))
        .map((c) => ({
          compound_id_from: compound_id,
          compound_id_to: rxcuiToId.get(c.rxcui)!,
          relation_type: c.tty || "related",
        }));
      if (toInsert.length > 0) await supabase.from("compound_relation").insert(toInsert);
    }

    for (const s of labelSnippets) {
      const section_type = SECTION_TYPE_MAP[s.section] ?? "mechanism";
      await supabase.from("compound_label_snippet").insert({
        compound_id,
        section_type,
        snippet_text: s.text.slice(0, 10000),
        source: s.source,
        source_url: null,
        source_version: null,
      });
    }

    const [fdaResult, pubmedStudies] = await Promise.all([
      fda.fetchFdaForRxcui(rxcui, canonical_name),
      pubmed.fetchPubmedStudiesForCompound(canonical_name, 15),
    ]);

    if (fdaResult) {
      await supabase.from("compound_regulatory").delete().eq("compound_id", compound_id);
      await supabase.from("compound_regulatory").insert({
        compound_id,
        approval_date: null,
        approval_type: fdaResult.regulatory.approval_type,
        approval_status: fdaResult.regulatory.approval_status,
        fda_application_number: fdaResult.regulatory.fda_application_number,
        fda_label_url: fdaResult.regulatory.fda_label_url,
        boxed_warning: fdaResult.regulatory.boxed_warning,
        rems_required: false,
        controlled_substance_schedule: null,
      });
      await supabase.from("compound_fda_label_section").delete().eq("compound_id", compound_id);
      if (fdaResult.label_sections.length > 0) {
        await supabase.from("compound_fda_label_section").insert(
          fdaResult.label_sections.map((sec) => ({
            compound_id,
            section: sec.section,
            content: sec.content,
            source_url: sec.source_url,
            version_date: null,
          }))
        );
      }
      const drugGroup =
        fdaResult.regulatory.approval_status === "approved"
          ? "approved"
          : null;
      if (drugGroup) {
        await supabase.from("compound").update({ drug_group: drugGroup, updated_at: new Date().toISOString() }).eq("id", compound_id);
      }
    }

    if (pubmedStudies.length > 0) {
      for (const study of pubmedStudies) {
        await supabase
          .from("compound_study")
          .upsert(
            {
              compound_id,
              pubmed_id: study.pubmed_id,
              title: study.title,
              journal: study.journal,
              publication_date: study.publication_date,
              study_type: study.study_type,
              population_size: study.population_size,
              summary: study.summary,
              doi: study.doi,
              pubmed_url: study.pubmed_url,
            },
            { onConflict: "compound_id,pubmed_id" }
          );
      }
    }

    if (pubchemResult) {
      const structureUrls = pubchem.getStructureUrlsForCid(pubchemResult.cid);
      await supabase.from("compound_pubchem").upsert(
        {
          compound_id,
          pubchem_cid: pubchemResult.cid,
          molecular_formula: pubchemResult.molecular_formula ?? pubchemResult.formula ?? null,
          molecular_weight: pubchemResult.molecular_weight != null ? String(pubchemResult.molecular_weight) : null,
          smiles: pubchemResult.smiles ?? null,
          inchi_key: pubchemResult.inchi_key ?? null,
          structure_3d_url: structureUrls.structure_3d_url,
          sdf_url: structureUrls.sdf_url,
          mol_url: structureUrls.mol_url,
        },
        { onConflict: "compound_id" }
      );
      await supabase
        .from("compound_identifier")
        .upsert(
          { compound_id, id_type: "pubchem_cid", id_value: String(pubchemResult.cid), source: "pubchem" },
          { onConflict: "compound_id,id_type" }
        );
    }

    // ChEMBL drug–target: fetch targets and compound_target links; collect names for card
    let mechanismTargetNames: string[] = [];
    try {
      const chemblSourceRefId = await getOrCreateSourceRef(supabase, "chembl", "https://www.ebi.ac.uk/chembl/", "ChEMBL");
      const compoundTargets = await chembl.fetchCompoundTargets(canonical_name, rxcui);
      const nowIso = new Date().toISOString();
      for (const row of compoundTargets) {
        const targetRow = {
          type: row.target.type,
          uniprot_id: row.target.uniprot_id ?? null,
          chembl_id: row.target.chembl_id,
          name: row.target.name,
          gene_symbol: row.target.gene_symbol ?? null,
          species: row.target.species ?? null,
          organism: row.target.organism ?? row.target.species ?? null,
          aliases: Array.isArray(row.target.aliases) && row.target.aliases.length > 0 ? row.target.aliases : [],
          source: row.target.source,
          updated_at: nowIso,
        };
        const { data: targetData } =
          row.target.uniprot_id != null
            ? await supabase.from("target").upsert(targetRow, { onConflict: "uniprot_id" }).select("id").single()
            : await supabase.from("target").upsert(targetRow, { onConflict: "chembl_id" }).select("id").single();
        const target_id = targetData?.id;
        if (target_id) {
          await supabase
            .from("compound_target")
            .upsert(
              {
                compound_id,
                target_id,
                action: row.action,
                source: "chembl",
                source_url: row.source_url ?? null,
                evidence_strength: "assay",
                confidence: 0.85,
                retrieved_at: nowIso,
                source_ref_id: chemblSourceRefId,
              },
              { onConflict: "compound_id,target_id" }
            );
          mechanismTargetNames.push(row.target.name);
        }
      }
      mechanismTargetNames = [...new Set(mechanismTargetNames)].slice(0, 50);
    } catch (_) {
      // ChEMBL optional: do not fail ingest
    }

    let interactionCount: number | null = null;
    try {
      const interactionSnippet = labelSnippets.find((s) => /drug_interaction/i.test(s.section))?.text;
      if (interactionSnippet) {
        const dailymedSourceRefId = await getOrCreateSourceRef(supabase, "dailymed_label", "https://dailymed.nlm.nih.gov/", "DailyMed");
        const candidates = parseDrugInteractionCandidates(interactionSnippet);
        const severity = inferSeverity(interactionSnippet);
        const description = interactionSnippet.slice(0, 5000);
        const nowIso = new Date().toISOString();
        for (const candidateName of candidates) {
          const resolved = await resolveDrugName(candidateName, supabase);
          if (resolved && resolved.rxcui !== rxcui) {
            const idA = compound_id < resolved.compound_id ? compound_id : resolved.compound_id;
            const idB = compound_id < resolved.compound_id ? resolved.compound_id : compound_id;
            await supabase.from("compound_interaction").upsert(
              {
                compound_id_a: idA,
                compound_id_b: idB,
                severity,
                description,
                mechanism: null,
                management: null,
                source: "dailymed",
                evidence_strength: "label",
                confidence: 0.9,
                retrieved_at: nowIso,
                source_ref_id: dailymedSourceRefId,
                resolution_status: "resolved",
              },
              { onConflict: "compound_id_a,compound_id_b" }
            );
          } else if (!resolved) {
            const rawName = candidateName.slice(0, 500);
            const { data: existing } = await supabase
              .from("compound_interaction")
              .select("id")
              .eq("compound_id_a", compound_id)
              .is("compound_id_b", null)
              .eq("other_drug_raw_name", rawName)
              .limit(1)
              .maybeSingle();
            if (!existing) {
              await supabase.from("compound_interaction").insert({
                compound_id_a: compound_id,
                compound_id_b: null,
                other_drug_raw_name: rawName,
                resolution_status: "unresolved",
                severity,
                description,
                mechanism: null,
                management: null,
                source: "dailymed",
                evidence_strength: "label",
                confidence: 0.9,
                retrieved_at: nowIso,
                source_ref_id: dailymedSourceRefId,
              });
            }
          }
        }
        const { count } = await supabase
          .from("compound_interaction")
          .select("id", { count: "exact", head: true })
          .eq("compound_id_a", compound_id);
        interactionCount = count ?? null;
      }
    } catch (_) {
      // DDI parse optional
    }

    try {
      const atcRows = await atc.fetchAtcForRxcui(rxcui);
      if (atcRows.length > 0) {
        const rxclassSourceRefId = await getOrCreateSourceRef(supabase, "rxclass", "https://rxnav.nlm.nih.gov/", "RxClass");
        const nowIso = new Date().toISOString();
        await supabase.from("compound_atc").delete().eq("compound_id", compound_id);
        await supabase.from("compound_atc").insert(
          atcRows.map((row) => ({
            compound_id,
            atc_code: row.atc_code,
            atc_name: row.atc_name,
            level: row.level,
            source: "rxclass",
            evidence_strength: "curated",
            confidence: 0.9,
            retrieved_at: nowIso,
            source_ref_id: rxclassSourceRefId,
          }))
        );
      }
    } catch (_) {
      // ATC optional
    }

    try {
      const trials = await clinicaltrials.fetchTrialsForDrug(canonical_name, 15);
      if (trials.length > 0) {
        const ctSourceRefId = await getOrCreateSourceRef(supabase, "clinicaltrials_gov", "https://clinicaltrials.gov/", "ClinicalTrials.gov");
        const nowIso = new Date().toISOString();
        for (const t of trials) {
          await supabase
            .from("compound_trial")
            .upsert(
              {
                compound_id,
                nct_id: t.nct_id,
                title: t.title,
                phase: t.phase,
                status: t.status,
                conditions: t.conditions,
                source_url: t.source_url,
                evidence_strength: "curated",
                confidence: 0.9,
                retrieved_at: nowIso,
                source_ref_id: ctSourceRefId,
              },
              { onConflict: "compound_id,nct_id" }
            );
        }
      }
    } catch (_) {
      // ClinicalTrials optional
    }

    try {
      const products = await ndc.fetchNdcProductsForSubstance(canonical_name, 25);
      if (products.length > 0) {
        const openFdaNdcSourceRefId = await getOrCreateSourceRef(supabase, "openfda_ndc", "https://api.fda.gov/drug/ndc.json", "openFDA NDC");
        await supabase.from("compound_product").delete().eq("compound_id", compound_id);
        await supabase.from("compound_product").insert(
          products.map((p) => ({
            compound_id,
            ndc: p.ndc,
            product_ndc: p.product_ndc,
            dosage_form: p.dosage_form,
            strength: p.strength,
            manufacturer: p.manufacturer,
            source: "openfda",
            brand_name: p.brand_name ?? null,
            generic_name: p.generic_name ?? null,
            route: p.route ?? null,
            approval_status: p.approval_status ?? null,
            application_number: p.application_number ?? null,
            source_ref_id: openFdaNdcSourceRefId,
          }))
        );
      }
    } catch (_) {
      // NDC products optional
    }

    const slug = canonical_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const primaryClass = inferPrimaryClass(mechanismSummary ?? usesSummary ?? "");
    const moleculeType = inferMoleculeType(pubchemResult?.molecular_weight);
    let { pharmacokinetics, pharmacodynamics } = extractKineticsFromSnippets(labelSnippets);
    const adverseFrequency = buildAdverseFrequency(labelSnippets, safetySummary);
    try {
      if (Object.keys(adverseFrequency).length > 0) {
        const dailymedAeSourceRefId = await getOrCreateSourceRef(supabase, "dailymed_label", "https://dailymed.nlm.nih.gov/", "DailyMed");
        const nowIso = new Date().toISOString();
        await supabase.from("compound_adverse_effect").delete().eq("compound_id", compound_id);
        await supabase.from("compound_adverse_effect").insert(
          Object.entries(adverseFrequency).map(([effect_term, frequency]) => ({
            compound_id,
            effect_term,
            frequency,
            severity: null,
            source: "dailymed",
            evidence_strength: "label",
            confidence: 0.9,
            retrieved_at: nowIso,
            source_ref_id: dailymedAeSourceRefId,
          }))
        );
      }
    } catch (_) {
      // adverse effect table optional
    }
    let pharmacokinetics_source: string | null = "label_section";
    let pk_extraction_method: string | null = "regex_v1";
    let pk_confidence: number | null = 0.7;
    if (process.env.OPENAI_API_KEY || process.env.FULL_PK) {
      try {
        const pkSections = labelSnippets
          .filter((s) => /clinical_pharmacology|dosage_and_administration|mechanism_of_action/i.test(s.section))
          .map((s) => s.text)
          .join("\n\n");
        if (pkSections.trim()) {
          const extracted = await extractPharmacokineticsFromText(pkSections);
          const merged: Record<string, unknown> = { ...pharmacokinetics };
          for (const [k, v] of Object.entries(extracted)) {
            if (v != null && k !== "other") merged[k] = v;
          }
          if ((extracted as { other?: Record<string, unknown> }).other) {
            Object.assign(merged, (extracted as { other?: Record<string, unknown> }).other);
          }
          pharmacokinetics = merged;
          pk_extraction_method = "llm_v1";
          pk_confidence = 0.85;
        }
      } catch (_) {
        // Keep regex-only PK
      }
    }
    const clinicalProfile = buildClinicalProfile(labelSnippets, usesSummary);
    try {
      const approved = (clinicalProfile as { approved_indications?: string[] }).approved_indications ?? [];
      if (approved.length > 0) {
        const dailymedIndSourceRefId = await getOrCreateSourceRef(supabase, "dailymed_label", "https://dailymed.nlm.nih.gov/", "DailyMed");
        const nowIso = new Date().toISOString();
        await supabase.from("compound_indication").delete().eq("compound_id", compound_id);
        await supabase.from("compound_indication").insert(
          approved.map((condition_name_or_code) => ({
            compound_id,
            condition_name_or_code,
            source: "dailymed",
            approved: true,
            evidence_strength: "label",
            confidence: 0.9,
            retrieved_at: nowIso,
            source_ref_id: dailymedIndSourceRefId,
          }))
        );
      }
    } catch (_) {
      // compound_indication optional
    }
    const deckTags = inferDeckTags(primaryClass, usesSummary);
    const deckStats = buildDeckStats(primaryClass, moleculeType);
    const regulatorySummary =
      fdaResult?.regulatory &&
      (fdaResult.regulatory.approval_status === "approved" || fdaResult.regulatory.fda_application_number)
        ? [
            fdaResult.regulatory.approval_status === "approved" ? "FDA approved" : null,
            fdaResult.regulatory.fda_application_number ? `Application ${fdaResult.regulatory.fda_application_number}` : null,
            fdaResult.regulatory.boxed_warning ? "Boxed warning: Yes" : null,
          ]
            .filter(Boolean)
            .join(". ")
        : null;
    const evidenceSummary =
      pubmedStudies.length > 0 ? `Supported by ${pubmedStudies.length} clinical study${pubmedStudies.length === 1 ? "" : "ies"}.` : null;
    const sourceRefs = [
      { type: "rxnorm", url: "https://rxnav.nlm.nih.gov/", last_updated: new Date().toISOString().slice(0, 10) },
      { type: "openfda", url: "https://api.fda.gov/drug/label.json", last_updated: new Date().toISOString().slice(0, 10) },
    ];

    const { data: maxVer } = await supabase
      .from("compound_card")
      .select("version")
      .eq("compound_id", compound_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    const nextVersion = (maxVer?.version ?? 0) + 1;
    await supabase.from("compound_card").insert({
      compound_id,
      version: nextVersion,
      slug: slug || null,
      canonical_name,
      rxcui,
      molecule_type: moleculeType,
      primary_class: primaryClass || null,
      secondary_classes: [],
      route_forms: [],
      mechanism_summary: mechanismSummary,
      mechanism_targets: mechanismTargetNames,
      mechanism_type: null,
      uses_summary: usesSummary,
      safety_summary: safetySummary,
      pharmacokinetics: Object.keys(pharmacokinetics).length ? pharmacokinetics : {},
      pharmacodynamics: Object.keys(pharmacodynamics).length ? pharmacodynamics : {},
      pharmacokinetics_source: pharmacokinetics_source,
      pk_extraction_method: pk_extraction_method,
      pk_confidence: pk_confidence,
      clinical_profile: clinicalProfile,
      adverse_effect_frequency: adverseFrequency,
      chemistry_profile: pubchemResult?.chemistry_profile ?? {},
      interaction_summary: null,
      interactions_count: interactionCount ?? null,
      deck_stats: deckStats,
      deck_tags: deckTags,
      approval_year: null,
      patent_expiration_year: null,
      availability_profile: {},
      source_links: sourceLinks,
      source_refs: sourceRefs,
      published: true,
      published_at: new Date().toISOString(),
      regulatory_summary: regulatorySummary,
      evidence_summary: evidenceSummary,
      study_count: pubmedStudies.length > 0 ? pubmedStudies.length : null,
      guideline_count: null,
      // Legacy columns (002) for backward compatibility
      classification: primaryClass,
      rarity_score: deckStats.rarity_score ?? null,
      power_score: deckStats.metabolic_score ?? deckStats.adoption_score ?? null,
      vibe_tags: deckTags,
    });

    await supabase.from("compound_source_reference").upsert(
      { compound_id, source_type: "rxnorm", source_url: null, last_checked_at: new Date().toISOString() },
      { onConflict: "compound_id,source_type" }
    );
    await supabase.from("compound_source_reference").upsert(
      { compound_id, source_type: "openfda", source_url: "https://api.fda.gov/drug/label.json", last_checked_at: new Date().toISOString() },
      { onConflict: "compound_id,source_type" }
    );

    return { rxcui, canonical_name, ok: true };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof (err as { message?: string })?.message === "string"
          ? (err as { message: string }).message
          : JSON.stringify(err);
    return { rxcui, canonical_name, ok: false, error: message };
  }
}
