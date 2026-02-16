/**
 * Single-compound ingestion: resolve RxCUI, enrich, persist to robust schema.
 * All tables key off compound.id (uuid); compound.rxcui is unique for lookups.
 */

import { getSupabase } from "database";
import * as rxnorm from "./rxnorm.js";
import * as dailymed from "./dailymed.js";
import type { LabelSnippetInput } from "./dailymed.js";
import * as pubchem from "./pubchem.js";
import * as fda from "./fda.js";
import * as pubmed from "./pubmed.js";

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
  const supabase = getSupabase();
  if (!supabase) {
    return { rxcui: "", canonical_name: inputName, ok: false, error: "Supabase URL and key must be set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) for ingest." };
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
      await supabase.from("compound_pubchem").upsert(
        {
          compound_id,
          pubchem_cid: pubchemResult.cid,
          molecular_formula: pubchemResult.molecular_formula ?? pubchemResult.formula ?? null,
          molecular_weight: pubchemResult.molecular_weight != null ? String(pubchemResult.molecular_weight) : null,
          smiles: pubchemResult.smiles ?? null,
          inchi_key: pubchemResult.inchi_key ?? null,
        },
        { onConflict: "compound_id" }
      );
    }

    const slug = canonical_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const primaryClass = inferPrimaryClass(mechanismSummary ?? usesSummary ?? "");
    const moleculeType = inferMoleculeType(pubchemResult?.molecular_weight);
    const { pharmacokinetics, pharmacodynamics } = extractKineticsFromSnippets(labelSnippets);
    const clinicalProfile = buildClinicalProfile(labelSnippets, usesSummary);
    const adverseFrequency = buildAdverseFrequency(labelSnippets, safetySummary);
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
      mechanism_targets: [],
      mechanism_type: null,
      uses_summary: usesSummary,
      safety_summary: safetySummary,
      pharmacokinetics: Object.keys(pharmacokinetics).length ? pharmacokinetics : {},
      pharmacodynamics: Object.keys(pharmacodynamics).length ? pharmacodynamics : {},
      clinical_profile: clinicalProfile,
      adverse_effect_frequency: adverseFrequency,
      chemistry_profile: pubchemResult?.chemistry_profile ?? {},
      interaction_summary: null,
      interactions_count: null,
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
