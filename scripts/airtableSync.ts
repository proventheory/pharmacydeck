/**
 * Sync compounds with Airtable: push CSV/queue/DB to Airtable or pull from Airtable to CSV.
 * Schema: see scripts/AIRTABLE_PRODUCTION_SCHEMA.md (Compound Queue, Compound Metadata, Compound Sources, Compound Targets, Compound Interactions).
 *
 * Push (default): read top_compounds.csv or ingest_queue, create/update records in Compound Queue.
 *   --from-db: push to Queue, Metadata, Sources (and optionally Targets, Interactions) with every column filled.
 *   --from-db --minimal: push to Queue only with canonical_name + rxcui.
 *   --from-db --to queue | --to metadata | --to sources | --to targets | --to interactions: push only to those tables.
 * Pull: fetch all from Airtable and write CSV.
 *
 * Env: AIRTABLE_ACCESS_TOKEN, AIRTABLE_BASE_ID. Optional: AIRTABLE_COMPOUNDS_TABLE, AIRTABLE_METADATA_TABLE,
 * AIRTABLE_SOURCES_TABLE, AIRTABLE_TARGETS_TABLE, AIRTABLE_INTERACTIONS_TABLE.
 *
 * Usage:
 *   npx tsx scripts/airtableSync.ts --from-db
 *   npx tsx scripts/airtableSync.ts --from-db --to metadata --to targets
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TABLE = process.env.AIRTABLE_COMPOUNDS_TABLE ?? "Compounds";
const TABLE_METADATA = process.env.AIRTABLE_METADATA_TABLE ?? "Compound Metadata";
const TABLE_SOURCES = process.env.AIRTABLE_SOURCES_TABLE ?? "Compound Sources";
const TABLE_TARGETS = process.env.AIRTABLE_TARGETS_TABLE ?? "Compound Targets";
const TABLE_INTERACTIONS = process.env.AIRTABLE_INTERACTIONS_TABLE ?? "Compound Interactions";
const BATCH_SIZE = 10; // Airtable create/update limit per request

type RichCompoundRow = {
  compound_id?: string | null; // Supabase compound.id (UUID) for compound_uuid / linking
  rank: number;
  canonical_name: string;
  rxcui: string;
  priority_score: number;
  category: string;
  mechanism_summary?: string | null;
  uses_summary?: string | null;
  safety_summary?: string | null;
  primary_class?: string | null;
  molecule_type?: string | null;
  regulatory_summary?: string | null;
  approval_date?: string | null;
  fda_application_number?: string | null;
  boxed_warning?: boolean;
  study_count?: number | null;
  evidence_summary?: string | null;
  slug?: string | null;
  classification?: string | null;
  interaction_summary?: string | null;
  interactions_count?: number | null;
  guideline_count?: number | null;
  approval_year?: number | null;
  patent_expiration_year?: number | null;
  approval_type?: string | null;
  approval_status?: string | null;
  fda_label_url?: string | null;
  rems_required?: boolean;
  controlled_substance_schedule?: string | null;
  // Parity columns for Compound Metadata (see AIRTABLE_PRODUCTION_SCHEMA.md)
  compound_uuid?: string | null;
  pubchem_cid?: string | null;
  last_updated_at?: string | null;
  data_completeness_score?: number | null;
  ingestion_version?: number | null;
  is_published?: boolean | null;
  drug_group?: string | null;
  atc_code?: string | null;
  unii?: string | null;
  interaction_count?: number | null;
  target_count?: number | null;
  enzyme_count?: number | null;
  transporter_count?: number | null;
  carrier_count?: number | null;
  adverse_effect_count?: number | null;
  mechanism_targets_summary?: string | null;
  pharmacokinetics_summary?: string | null;
};

function loadEnv(): void {
  for (const p of [
    join(__dirname, "..", ".env"),
    join(__dirname, "..", "apps", "packbuilder", ".env"),
  ]) {
    if (existsSync(p)) {
      const content = readFileSync(p, "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
      break;
    }
  }
}

function parseCSV(csvPath: string): { rank: number; canonical_name: string; rxcui: string; priority_score: number; category: string }[] {
  const raw = readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].toLowerCase();
  const rankIdx = header.split(",").findIndex((h) => h.trim() === "rank");
  const nameIdx = header.split(",").findIndex((h) => h.trim() === "canonical_name");
  const rxcuiIdx = header.split(",").findIndex((h) => h.trim() === "rxcui");
  const scoreIdx = header.split(",").findIndex((h) => h.trim() === "priority_score");
  const catIdx = header.split(",").findIndex((h) => h.trim() === "category");
  const rows: { rank: number; canonical_name: string; rxcui: string; priority_score: number; category: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const rank = rankIdx >= 0 ? parseInt(cells[rankIdx] ?? "0", 10) || i : i;
    const canonical_name = (nameIdx >= 0 ? cells[nameIdx] : cells[1] ?? "").trim();
    const rxcui = (rxcuiIdx >= 0 ? cells[rxcuiIdx] : cells[2] ?? "").trim();
    if (!rxcui) continue;
    const priority_score = scoreIdx >= 0 ? parseInt(cells[scoreIdx] ?? "0", 10) || 0 : 100 - rank;
    const category = (catIdx >= 0 ? cells[catIdx] : cells[4] ?? "").trim();
    rows.push({ rank, canonical_name, rxcui, priority_score, category });
  }
  return rows;
}

/** List record ids by rxcui and/or canonical_name so we can match and upsert. Don't request specific fields to avoid 422 on missing columns. */
async function listAirtableRecordIds(
  token: string,
  baseId: string,
  tableName: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let offset: string | undefined;
  const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?pageSize=100`;
  do {
    const reqUrl = offset ? `${baseUrl}&offset=${offset}` : baseUrl;
    const res = await fetch(reqUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable GET ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[]; offset?: string };
    for (const r of data.records) {
      const id = r.id;
      const f = r.fields ?? {};
      const rxcui = String(f.rxcui ?? "").trim();
      const name = String(f.canonical_name ?? f.Name ?? f.name ?? "").trim();
      if (rxcui) out.set(rxcui, id);
      if (name) out.set(name.toLowerCase(), id);
    }
    offset = data.offset;
  } while (offset);
  return out;
}

async function pushToAirtable(
  token: string,
  baseId: string,
  rows: { rank: number; canonical_name: string; rxcui: string; priority_score: number; category: string }[]
): Promise<void> {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLE)}`;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const records = batch.map((r) => ({
      fields: {
        canonical_name: r.canonical_name,
        rxcui: r.rxcui,
        priority_score: r.priority_score,
        category: r.category || "",
        rank: r.rank,
      },
    }));
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records, typecast: true }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable POST ${res.status}: ${text}`);
    }
    console.log(`Pushed ${i + batch.length}/${rows.length} to Airtable.`);
  }
}

function minimalFields(r: RichCompoundRow): Record<string, unknown> {
  return { canonical_name: r.canonical_name, rxcui: r.rxcui };
}

/** Compound Queue: every column filled so nothing is left empty (see AIRTABLE_PRODUCTION_SCHEMA.md). */
function queueTableFields(r: RichCompoundRow): Record<string, unknown> {
  const slug =
    r.slug ||
    (r.canonical_name ?? "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80);
  return {
    canonical_name: r.canonical_name,
    rxcui: r.rxcui,
    priority_score: r.priority_score,
    category: r.category || "—",
    rank: r.rank,
    slug: slug || r.rxcui,
    status: "done",
    attempts: 0,
    last_enriched_at: new Date().toISOString(),
    next_retry_at: null as unknown,
    error: "",
    synced_to_pack: true,
    drug_group: r.drug_group ?? null,
  };
}

/** Compound Sources: core citation fields (see AIRTABLE_PRODUCTION_SCHEMA.md). source_type can be PubMed, FDA, DailyMed, PubChem, PharmacyTimes, ClinicalTrials.gov. */
function sourceTableFields(r: RichCompoundRow): Record<string, unknown> {
  return {
    rxcui: r.rxcui,
    title: r.canonical_name ? `Prescribing information: ${r.canonical_name}` : "Prescribing information",
    source_type: "FDA",
    source_url: r.fda_label_url || "https://www.accessdata.fda.gov/scripts/cder/daf/",
    published_date: r.approval_date ?? null,
    credibility_score: 85,
  };
}

function richFields(r: RichCompoundRow): Record<string, unknown> {
  return {
    canonical_name: r.canonical_name,
    rxcui: r.rxcui,
    priority_score: r.priority_score,
    category: r.category || "",
    rank: r.rank,
    mechanism_summary: r.mechanism_summary ?? "",
    uses_summary: r.uses_summary ?? "",
    safety_summary: r.safety_summary ?? "",
    primary_class: r.primary_class ?? "",
    molecule_type: r.molecule_type ?? "",
    regulatory_summary: r.regulatory_summary ?? "",
    approval_date: r.approval_date ?? "",
    fda_application_number: r.fda_application_number ?? "",
    boxed_warning: r.boxed_warning === true,
    study_count: r.study_count ?? null,
    evidence_summary: r.evidence_summary ?? "",
    slug: r.slug ?? "",
    classification: r.classification ?? "",
    interaction_summary: r.interaction_summary ?? "",
    interactions_count: r.interactions_count ?? null,
    guideline_count: r.guideline_count ?? null,
    approval_year: r.approval_year ?? null,
    patent_expiration_year: r.patent_expiration_year ?? null,
    approval_type: r.approval_type ?? "",
    approval_status: r.approval_status ?? "",
    fda_label_url: r.fda_label_url ?? "",
    rems_required: r.rems_required === true,
    controlled_substance_schedule: r.controlled_substance_schedule ?? "",
  };
}

/** Compound Metadata: every column filled (see AIRTABLE_PRODUCTION_SCHEMA.md). */
function metadataTableFields(r: RichCompoundRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    canonical_name: r.canonical_name,
    rxcui: r.rxcui,
    compound_uuid: r.compound_uuid ?? r.compound_id ?? null,
    pubchem_cid: r.pubchem_cid ?? null,
    last_updated_at: r.last_updated_at ?? new Date().toISOString(),
    data_completeness_score: r.data_completeness_score ?? null,
    ingestion_version: r.ingestion_version ?? 1,
    is_published: r.is_published ?? true,
    drug_group: r.drug_group ?? null,
    atc_code: r.atc_code ?? null,
    unii: r.unii ?? null,
    interaction_count: r.interaction_count ?? r.interactions_count ?? null,
    target_count: r.target_count ?? null,
    enzyme_count: r.enzyme_count ?? null,
    transporter_count: r.transporter_count ?? null,
    carrier_count: r.carrier_count ?? null,
    adverse_effect_count: r.adverse_effect_count ?? null,
    mechanism_targets_summary: r.mechanism_targets_summary ?? null,
    pharmacokinetics_summary: r.pharmacokinetics_summary ?? null,
    mechanism_summary: r.mechanism_summary ?? "",
    uses_summary: r.uses_summary ?? "",
    safety_summary: r.safety_summary ?? "",
    primary_class: r.primary_class ?? "",
    molecule_type: r.molecule_type ?? "",
    regulatory_summary: r.regulatory_summary ?? "",
    approval_date: r.approval_date ?? "",
    fda_application_number: r.fda_application_number ?? "",
    boxed_warning: r.boxed_warning === true,
    study_count: r.study_count ?? null,
    evidence_summary: r.evidence_summary ?? "",
    slug: r.slug ?? "",
    classification: r.classification ?? "",
    interaction_summary: r.interaction_summary ?? "",
    interactions_count: r.interactions_count ?? null,
    guideline_count: r.guideline_count ?? null,
    approval_year: r.approval_year ?? null,
    patent_expiration_year: r.patent_expiration_year ?? null,
    approval_type: r.approval_type ?? "",
    approval_status: r.approval_status ?? "",
    fda_label_url: r.fda_label_url ?? "",
    rems_required: r.rems_required === true,
    controlled_substance_schedule: r.controlled_substance_schedule ?? "",
  };
  return base;
}

type FieldMode = "minimal" | "rich" | "source" | "metadata" | "queue";

async function pushRichToAirtable(
  token: string,
  baseId: string,
  tableName: string,
  rows: RichCompoundRow[],
  fieldMode: FieldMode
): Promise<void> {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
  const existing = await listAirtableRecordIds(token, baseId, tableName);
  const modeLabel =
    fieldMode === "minimal"
      ? " (minimal)"
      : fieldMode === "source"
        ? " (Compound Sources columns)"
        : fieldMode === "metadata"
          ? " (Compound Metadata columns)"
          : fieldMode === "queue"
            ? " (Compound Queue columns)"
            : "";
  console.log(`Table "${tableName}": ${existing.size} existing records; syncing ${rows.length} from DB${modeLabel}.`);

  const toCreate: RichCompoundRow[] = [];
  const toUpdate: { id: string; row: RichCompoundRow }[] = [];
  for (const row of rows) {
    const id = existing.get(row.rxcui) ?? existing.get(row.canonical_name.toLowerCase());
    if (id) toUpdate.push({ id, row });
    else toCreate.push(row);
  }

  const fieldsFn =
    fieldMode === "minimal"
      ? minimalFields
      : fieldMode === "source"
        ? sourceTableFields
        : fieldMode === "metadata"
          ? metadataTableFields
          : fieldMode === "queue"
            ? queueTableFields
            : richFields;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);
    const records = batch.map(({ id, row }) => ({ id, fields: fieldsFn(row) }));
    const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ records, typecast: true }) });
    if (!res.ok) throw new Error(`Airtable PATCH ${res.status}: ${await res.text()}`);
    console.log(`Updated ${i + batch.length}/${toUpdate.length} in ${tableName}.`);
  }

  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    const records = batch.map((r) => ({ fields: fieldsFn(r) }));
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ records, typecast: true }) });
    if (!res.ok) throw new Error(`Airtable POST ${res.status}: ${await res.text()}`);
    console.log(`Created ${i + batch.length}/${toCreate.length} in ${tableName}.`);
  }
}

async function loadCompoundsFromDb(supabase: ReturnType<typeof createClient>): Promise<RichCompoundRow[]> {
  const { data: compounds, error: compoundsError } = await supabase
    .from("compound")
    .select("id, rxcui, canonical_name, drug_group")
    .eq("status", "active")
    .order("canonical_name");

  if (compoundsError || !compounds?.length) return [];

  const compoundRows = compounds as { id: string; rxcui: string; canonical_name?: string; drug_group?: string | null }[];
  const ids = compoundRows.map((c) => c.id);
  const [cardsRes, regRes, pubchemRes, atcRes, identifierRes, ctRes, adverseRes] = await Promise.all([
    supabase
      .from("compound_card")
      .select(
        "compound_id, version, slug, mechanism_summary, uses_summary, safety_summary, primary_class, molecule_type, classification, regulatory_summary, evidence_summary, study_count, guideline_count, interaction_summary, interactions_count, approval_year, patent_expiration_year, published, pharmacokinetics, mechanism_targets"
      )
      .in("compound_id", ids),
    supabase
      .from("compound_regulatory")
      .select("compound_id, approval_date, approval_type, approval_status, fda_application_number, fda_label_url, boxed_warning, rems_required, controlled_substance_schedule")
      .in("compound_id", ids),
    supabase.from("compound_pubchem").select("compound_id, pubchem_cid").in("compound_id", ids),
    supabase.from("compound_atc").select("compound_id, atc_code").in("compound_id", ids),
    supabase.from("compound_identifier").select("compound_id, id_type, id_value").in("compound_id", ids).eq("id_type", "unii"),
    supabase.from("compound_target").select("compound_id, target_id").in("compound_id", ids),
    supabase.from("compound_adverse_effect").select("compound_id").in("compound_id", ids),
  ]);

  type CardRow = {
    compound_id: string;
    version?: number;
    slug?: string;
    mechanism_summary?: string;
    uses_summary?: string;
    safety_summary?: string;
    primary_class?: string;
    molecule_type?: string;
    classification?: string;
    regulatory_summary?: string;
    evidence_summary?: string;
    study_count?: number;
    guideline_count?: number;
    interaction_summary?: string;
    interactions_count?: number;
    approval_year?: number;
    patent_expiration_year?: number;
    published?: boolean;
    pharmacokinetics?: unknown;
    mechanism_targets?: string[] | null;
  };
  const cards = (cardsRes.data ?? []) as CardRow[];
  const atcRows = (atcRes.error ? [] : atcRes.data ?? []) as { compound_id: string; atc_code: string }[];
  const identifierRows = (identifierRes.error ? [] : identifierRes.data ?? []) as { compound_id: string; id_value: string }[];
  const ctRows = (ctRes.error ? [] : ctRes.data ?? []) as { compound_id: string; target_id: string }[];
  const adverseRows = (adverseRes.error ? [] : adverseRes.data ?? []) as { compound_id: string }[];
  const targetIds = [...new Set(ctRows.map((r) => r.target_id))];
  let targetTypeById = new Map<string, string>();
  if (targetIds.length > 0) {
    const { data: targetData } = await supabase.from("target").select("id, type").in("id", targetIds);
    targetTypeById = new Map((targetData ?? []).map((t: { id: string; type?: string }) => [t.id, t.type ?? "target"]));
  }
  const targetCountByCompound = new Map<string, { target: number; enzyme: number; transporter: number; carrier: number }>();
  for (const ct of ctRows) {
    const type = targetTypeById.get(ct.target_id) ?? "target";
    const cur = targetCountByCompound.get(ct.compound_id) ?? { target: 0, enzyme: 0, transporter: 0, carrier: 0 };
    if (type === "enzyme") cur.enzyme++;
    else if (type === "transporter") cur.transporter++;
    else if (type === "carrier") cur.carrier++;
    else cur.target++;
    targetCountByCompound.set(ct.compound_id, cur);
  }
  const adverseCountByCompound = new Map<string, number>();
  for (const a of adverseRows) {
    adverseCountByCompound.set(a.compound_id, (adverseCountByCompound.get(a.compound_id) ?? 0) + 1);
  }
  const atcByCompound = new Map<string, string>();
  for (const a of atcRows) {
    if (!atcByCompound.has(a.compound_id)) atcByCompound.set(a.compound_id, a.atc_code);
  }
  const uniiByCompound = new Map<string, string>();
  for (const i of identifierRows) {
    uniiByCompound.set(i.compound_id, i.id_value);
  }
  const regs = (regRes.data ?? []) as {
    compound_id: string;
    approval_date?: string;
    approval_type?: string;
    approval_status?: string;
    fda_application_number?: string;
    fda_label_url?: string;
    boxed_warning?: boolean;
    rems_required?: boolean;
    controlled_substance_schedule?: string;
  }[];
  const pubchemRows = (pubchemRes.data ?? []) as { compound_id: string; pubchem_cid: string | number | null }[];
  const pubchemByCompoundId = new Map(pubchemRows.map((p) => [p.compound_id, p]));
  const regByCompoundId = new Map(regs.map((r) => [r.compound_id, r]));

  const cardByCompoundId = new Map<string, CardRow>();
  for (const c of cards) {
    const existing = cardByCompoundId.get(c.compound_id);
    if (!existing || (c.version ?? 0) > (existing.version ?? 0)) cardByCompoundId.set(c.compound_id, c);
  }

  const rows: RichCompoundRow[] = compoundRows.map((c, i) => {
    const card = cardByCompoundId.get(c.id) as CardRow | undefined;
    const reg = regByCompoundId.get(c.id);
    const pubchem = pubchemByCompoundId.get(c.id);
    const counts = targetCountByCompound.get(c.id);
    const targetTotal = counts ? counts.target + counts.enzyme + counts.transporter + counts.carrier : 0;
    const mechanismTargets = card?.mechanism_targets;
    const mechanismTargetsSummary =
      Array.isArray(mechanismTargets) && mechanismTargets.length > 0 ? mechanismTargets.join("; ").slice(0, 2000) : null;
    return {
      compound_id: c.id,
      compound_uuid: c.id,
      rank: i + 1,
      canonical_name: c.canonical_name ?? "",
      rxcui: c.rxcui,
      priority_score: 0,
      category: "",
      pubchem_cid: pubchem?.pubchem_cid != null ? String(pubchem.pubchem_cid) : null,
      last_updated_at: new Date().toISOString(),
      data_completeness_score: null,
      ingestion_version: 1,
      is_published: (card?.published as boolean) ?? true,
      drug_group: c.drug_group ?? null,
      atc_code: atcByCompound.get(c.id) ?? null,
      unii: uniiByCompound.get(c.id) ?? null,
      interaction_count: (card?.interactions_count as number) ?? null,
      target_count: targetTotal || null,
      enzyme_count: counts?.enzyme ?? null,
      transporter_count: counts?.transporter ?? null,
      carrier_count: counts?.carrier ?? null,
      adverse_effect_count: adverseCountByCompound.get(c.id) ?? null,
      mechanism_targets_summary: mechanismTargetsSummary,
      pharmacokinetics_summary: typeof card?.pharmacokinetics === "object" ? JSON.stringify(card.pharmacokinetics).slice(0, 5000) : null,
      mechanism_summary: (card?.mechanism_summary as string) ?? null,
      uses_summary: (card?.uses_summary as string) ?? null,
      safety_summary: (card?.safety_summary as string) ?? null,
      primary_class: (card?.primary_class as string) ?? null,
      molecule_type: (card?.molecule_type as string) ?? null,
      regulatory_summary: (card?.regulatory_summary as string) ?? null,
      approval_date: reg?.approval_date ?? null,
      fda_application_number: reg?.fda_application_number ?? null,
      boxed_warning: reg?.boxed_warning ?? false,
      study_count: (card?.study_count as number) ?? null,
      evidence_summary: (card?.evidence_summary as string) ?? null,
      slug: (card?.slug as string) ?? null,
      classification: (card?.classification as string) ?? null,
      interaction_summary: (card?.interaction_summary as string) ?? null,
      interactions_count: (card?.interactions_count as number) ?? null,
      guideline_count: (card?.guideline_count as number) ?? null,
      approval_year: (card?.approval_year as number) ?? null,
      patent_expiration_year: (card?.patent_expiration_year as number) ?? null,
      approval_type: reg?.approval_type ?? null,
      approval_status: reg?.approval_status ?? null,
      fda_label_url: reg?.fda_label_url ?? null,
      rems_required: reg?.rems_required ?? false,
      controlled_substance_schedule: reg?.controlled_substance_schedule ?? null,
    };
  });
  return rows;
}

/** Load compound_target + target from Supabase (if tables exist) and push to Airtable Compound Targets. */
async function pushCompoundTargetsToAirtable(
  token: string,
  baseId: string,
  supabase: ReturnType<typeof createClient>,
  rows: RichCompoundRow[]
): Promise<void> {
  const compoundIdToRxcui = new Map(rows.map((r) => [r.compound_id!, r.rxcui]));
  const rxcuiToMetaId = await listAirtableRecordIds(token, baseId, TABLE_METADATA);

  const { data: ctData, error: ctError } = await supabase
    .from("compound_target")
    .select("compound_id, target_id, action, source");
  if (ctError || !ctData?.length) {
    console.log(`Compound Targets: no data (compound_target not found or empty).`);
    return;
  }
  const ctRows = ctData as { compound_id: string; target_id: string; action?: string; source?: string }[];
  const targetIds = [...new Set(ctRows.map((r) => r.target_id))];
  const { data: targetData, error: targetError } = await supabase
    .from("target")
    .select("id, type, uniprot_id, name")
    .in("id", targetIds);
  if (targetError || !targetData?.length) {
    console.log(`Compound Targets: target table not found or empty.`);
    return;
  }
  const targetRows = targetData as { id: string; type?: string; uniprot_id?: string; name?: string }[];
  const targetById = new Map(targetRows.map((t) => [t.id, t]));

  const records: { compound: string[]; target_name: string; target_type: string; uniprot_id: string; action: string; source: string }[] = [];
  for (const ct of ctRows) {
    const rxcui = compoundIdToRxcui.get(ct.compound_id);
    const airtableId = rxcui ? rxcuiToMetaId.get(rxcui) : undefined;
    if (!airtableId) continue;
    const t = targetById.get(ct.target_id);
    records.push({
      compound: [airtableId],
      target_name: t?.name ?? "",
      target_type: t?.type ?? "target",
      uniprot_id: t?.uniprot_id ?? "",
      action: ct.action ?? "",
      source: ct.source ?? "",
    });
  }
  if (records.length === 0) {
    console.log(`Compound Targets: no records to push (missing Metadata links).`);
    return;
  }
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLE_TARGETS)}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ records: batch.map((r) => ({ fields: r })), typecast: true }),
    });
    if (!res.ok) throw new Error(`Airtable POST ${res.status}: ${await res.text()}`);
    console.log(`Pushed ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} to ${TABLE_TARGETS}.`);
  }
}

/** Load compound_interaction from Supabase (if table exists) and push to Airtable Compound Interactions. */
async function pushCompoundInteractionsToAirtable(
  token: string,
  baseId: string,
  supabase: ReturnType<typeof createClient>,
  rows: RichCompoundRow[]
): Promise<void> {
  const compoundIdToRxcui = new Map(rows.map((r) => [r.compound_id!, r.rxcui]));
  const rxcuiToMetaId = await listAirtableRecordIds(token, baseId, TABLE_METADATA);

  const { data: ciData, error: ciError } = await supabase
    .from("compound_interaction")
    .select("compound_id_a, compound_id_b, severity, description, mechanism, management, source");
  if (ciError || !ciData?.length) {
    console.log(`Compound Interactions: no data (compound_interaction not found or empty).`);
    return;
  }
  const ciRows = ciData as { compound_id_a: string; compound_id_b: string; severity?: string; description?: string; mechanism?: string; management?: string; source?: string }[];
  const records: { compound_a: string[]; compound_b: string[]; severity: string; description: string; mechanism: string; management: string; source: string }[] = [];
  for (const ci of ciRows) {
    const rxcuiA = compoundIdToRxcui.get(ci.compound_id_a);
    const rxcuiB = compoundIdToRxcui.get(ci.compound_id_b);
    const idA = rxcuiA ? rxcuiToMetaId.get(rxcuiA) : undefined;
    const idB = rxcuiB ? rxcuiToMetaId.get(rxcuiB) : undefined;
    if (!idA || !idB) continue;
    records.push({
      compound_a: [idA],
      compound_b: [idB],
      severity: ci.severity ?? "unknown",
      description: ci.description ?? "",
      mechanism: ci.mechanism ?? "",
      management: ci.management ?? "",
      source: ci.source ?? "",
    });
  }
  if (records.length === 0) {
    console.log(`Compound Interactions: no records to push (missing Metadata links).`);
    return;
  }
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLE_INTERACTIONS)}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ records: batch.map((r) => ({ fields: r })), typecast: true }),
    });
    if (!res.ok) throw new Error(`Airtable POST ${res.status}: ${await res.text()}`);
    console.log(`Pushed ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} to ${TABLE_INTERACTIONS}.`);
  }
}

async function pullFromAirtable(
  token: string,
  baseId: string,
  outPath: string
): Promise<void> {
  const rows: { rank: number; canonical_name: string; rxcui: string; priority_score: number; category: string }[] = [];
  let offset: string | undefined;
  const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLE)}?pageSize=100`;
  do {
    const reqUrl = offset ? `${baseUrl}&offset=${offset}` : baseUrl;
    const res = await fetch(reqUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable GET ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records: { fields: Record<string, unknown> }[]; offset?: string };
    let rank = rows.length + 1;
    for (const r of data.records) {
      const f = r.fields;
      const canonical_name = String(f?.canonical_name ?? f?.Name ?? "").trim();
      const rxcui = String(f?.rxcui ?? "").trim();
      if (!rxcui) continue;
      const priority_score = typeof f?.priority_score === "number" ? f.priority_score : parseInt(String(f?.priority_score ?? "0"), 10) || 0;
      const category = String(f?.category ?? "").trim();
      rows.push({ rank, canonical_name, rxcui, priority_score, category });
      rank++;
    }
    offset = data.offset;
  } while (offset);

  const csv =
    "rank,canonical_name,rxcui,priority_score,category\n" +
    rows.map((r) => `${r.rank},${r.canonical_name},${r.rxcui},${r.priority_score},${r.category}`).join("\n");
  writeFileSync(outPath, csv);
  console.log(`Pulled ${rows.length} rows from Airtable → ${outPath}`);
}

async function main() {
  loadEnv();
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error("AIRTABLE_ACCESS_TOKEN and AIRTABLE_BASE_ID required");

  const args = process.argv.slice(2);
  const pull = args.includes("--pull");
  const fromQueue = args.includes("--from-queue");
  const fromDb = args.includes("--from-db");
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : join(__dirname, "..", "compounds_from_airtable.csv");

  if (pull) {
    await pullFromAirtable(token, baseId, outPath);
    return;
  }

  if (fromDb) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --from-db");
    const toTargets = new Set<string>();
    for (let i = 0; i < args.length - 1; i++) if (args[i] === "--to") toTargets.add(args[i + 1]);
    const syncAll = toTargets.size === 0;
    const toQueue = syncAll || toTargets.has("queue");
    const toMeta = syncAll || toTargets.has("metadata");
    const toSources = syncAll || toTargets.has("sources");
    const toTargetsTable = syncAll || toTargets.has("targets");
    const toInteractionsTable = syncAll || toTargets.has("interactions");
    const minimal = args.includes("--minimal");
    const supabase = createClient(url, key);
    const rows = await loadCompoundsFromDb(supabase);
    console.log(`Loaded ${rows.length} compounds (with card + regulatory) from Supabase.`);

    const run = async (table: string, mode: FieldMode) => {
      try {
        await pushRichToAirtable(token, baseId, table, rows, mode);
      } catch (e) {
        console.error(`Table "${table}" failed:`, e instanceof Error ? e.message : e);
      }
    };
    if (toQueue) await run(TABLE, minimal ? "minimal" : "queue");
    if (toMeta) await run(TABLE_METADATA, "metadata");
    if (toSources) await run(TABLE_SOURCES, "source");
    if (toTargetsTable) {
      try {
        await pushCompoundTargetsToAirtable(token, baseId, supabase, rows);
      } catch (e) {
        console.error(`Table "${TABLE_TARGETS}" failed:`, e instanceof Error ? e.message : e);
      }
    }
    if (toInteractionsTable) {
      try {
        await pushCompoundInteractionsToAirtable(token, baseId, supabase, rows);
      } catch (e) {
        console.error(`Table "${TABLE_INTERACTIONS}" failed:`, e instanceof Error ? e.message : e);
      }
    }
    console.log("Airtable sync (DB → Airtable) done.");
    return;
  }

  let rows: { rank: number; canonical_name: string; rxcui: string; priority_score: number; category: string }[];

  if (fromQueue) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --from-queue");
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("ingest_queue")
      .select("rxcui, canonical_name, priority_score, category")
      .in("status", ["pending", "done"])
      .order("id", { ascending: true });
    if (error) throw error;
    rows = (data ?? []).map((r, i) => ({
      rank: i + 1,
      canonical_name: (r.canonical_name ?? r.rxcui).trim(),
      rxcui: r.rxcui,
      priority_score: r.priority_score ?? 0,
      category: (r.category ?? "").trim(),
    }));
    console.log(`Loaded ${rows.length} rows from ingest_queue.`);
  } else {
    const csvPath = args.find((a) => !a.startsWith("--") && a.endsWith(".csv")) ?? join(__dirname, "..", "top_compounds.csv");
    if (!existsSync(csvPath)) {
      console.error("CSV not found:", csvPath);
      console.error("Usage: npx tsx scripts/airtableSync.ts [path/to/top_compounds.csv] | --from-queue | --from-db | --pull --out file.csv");
      process.exit(1);
    }
    rows = parseCSV(csvPath);
  }

  await pushToAirtable(token, baseId, rows);
  console.log("Airtable sync done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
