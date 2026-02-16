/**
 * Sync compounds with Airtable: push CSV/queue/DB to Airtable (structure & edit) or pull from Airtable to CSV.
 *
 * Push (default): read top_compounds.csv or ingest_queue, create/update records.
 *   --from-db: push compound+card+regulatory from Supabase.
 *   --from-db --minimal: push only canonical_name + rxcui (for Compound Queue when rich columns are missing).
 *   --from-db --to metadata: push full data to "Compound Metadata" table.
 *   --from-db --to sources: push data to "Compound Sources" table (Name, mechanism_action, uses_summary, drug_class, etc.).
 *   --from-db --to metadata --to sources: push to both tables.
 * Pull: fetch all from Airtable and write CSV.
 *
 * Table names: AIRTABLE_COMPOUNDS_TABLE (default "Compounds"), AIRTABLE_METADATA_TABLE ("Compound Metadata"),
 * AIRTABLE_SOURCES_TABLE ("Compound Sources"). Use "Compound Queue" for the queue table.
 *
 * Usage:
 *   npx tsx scripts/airtableSync.ts --from-db --to metadata   # sync to Compound Metadata
 *   npx tsx scripts/airtableSync.ts --from-db --to sources    # sync to Compound Sources
 *   npx tsx scripts/airtableSync.ts --from-db --minimal       # sync to Compound Queue (canonical_name + rxcui only)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TABLE = process.env.AIRTABLE_COMPOUNDS_TABLE ?? "Compounds";
const TABLE_METADATA = process.env.AIRTABLE_METADATA_TABLE ?? "Compound Metadata";
const TABLE_SOURCES = process.env.AIRTABLE_SOURCES_TABLE ?? "Compound Sources";
const BATCH_SIZE = 10; // Airtable create/update limit per request

type RichCompoundRow = {
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

/** Map our DB fields to Compound Sources table column names (Name, mechanism_action, drug_class, etc.). */
function sourceTableFields(r: RichCompoundRow): Record<string, unknown> {
  return {
    Name: r.canonical_name,
    rxcui: r.rxcui,
    mechanism_action: r.mechanism_summary ?? "",
    uses_summary: r.uses_summary ?? "",
    safety_summary: r.safety_summary ?? "",
    drug_class: r.primary_class ?? "",
    interactions_summary: r.interaction_summary ?? "",
    regulatory_summary: r.regulatory_summary ?? "",
    approval_date: r.approval_date ?? "",
    fda_application_number: r.fda_application_number ?? "",
    evidence_summary: r.evidence_summary ?? "",
    study_count: r.study_count ?? null,
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

/** Compound Metadata table: same as rich but omit queue-only fields (priority_score, rank, category). */
function metadataTableFields(r: RichCompoundRow): Record<string, unknown> {
  return {
    canonical_name: r.canonical_name,
    rxcui: r.rxcui,
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

type FieldMode = "minimal" | "rich" | "source" | "metadata";

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
    .select("id, rxcui, canonical_name")
    .eq("status", "active")
    .order("canonical_name");

  if (compoundsError || !compounds?.length) return [];

  const ids = compounds.map((c) => c.id);
  const [cardsRes, regRes] = await Promise.all([
    supabase
      .from("compound_card")
      .select(
        "compound_id, version, slug, mechanism_summary, uses_summary, safety_summary, primary_class, molecule_type, classification, regulatory_summary, evidence_summary, study_count, guideline_count, interaction_summary, interactions_count, approval_year, patent_expiration_year"
      )
      .in("compound_id", ids),
    supabase
      .from("compound_regulatory")
      .select("compound_id, approval_date, approval_type, approval_status, fda_application_number, fda_label_url, boxed_warning, rems_required, controlled_substance_schedule")
      .in("compound_id", ids),
  ]);

  const cards = cardsRes.data ?? [];
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
  const regByCompoundId = new Map(regs.map((r) => [r.compound_id, r]));

  const cardByCompoundId = new Map<string, (typeof cards)[0]>();
  for (const c of cards) {
    const existing = cardByCompoundId.get(c.compound_id);
    if (!existing || (c.version ?? 0) > (existing.version ?? 0)) cardByCompoundId.set(c.compound_id, c);
  }

  const rows: RichCompoundRow[] = compounds.map((c, i) => {
    const card = cardByCompoundId.get(c.id) as Record<string, unknown> | undefined;
    const reg = regByCompoundId.get(c.id);
    return {
      rank: i + 1,
      canonical_name: (c as { canonical_name?: string }).canonical_name ?? "",
      rxcui: (c as { rxcui: string }).rxcui,
      priority_score: 0,
      category: "",
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
    const toMeta = toTargets.has("metadata");
    const toSources = toTargets.has("sources");
    const minimal = args.includes("--minimal");
    const supabase = createClient(url, key);
    const rows = await loadCompoundsFromDb(supabase);
    console.log(`Loaded ${rows.length} compounds (with card + regulatory) from Supabase.`);

    if (toMeta) await pushRichToAirtable(token, baseId, TABLE_METADATA, rows, "metadata");
    if (toSources) await pushRichToAirtable(token, baseId, TABLE_SOURCES, rows, "source");
    if (!toMeta && !toSources) await pushRichToAirtable(token, baseId, TABLE, rows, minimal ? "minimal" : "rich");
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
