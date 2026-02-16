/**
 * Sync compounds with Airtable: push CSV/queue to Airtable (structure & edit) or pull from Airtable to CSV.
 *
 * Push (default): read top_compounds.csv or ingest_queue, create/update records in Airtable table "Compounds".
 * Pull: fetch all from Airtable and write CSV.
 *
 * Usage:
 *   npx tsx scripts/airtableSync.ts [path/to/top_compounds.csv]   # push CSV to Airtable
 *   npx tsx scripts/airtableSync.ts --from-queue                  # push from ingest_queue (pending + done)
 *   npx tsx scripts/airtableSync.ts --pull --out compounds_from_airtable.csv
 *
 * Env: AIRTABLE_ACCESS_TOKEN, AIRTABLE_BASE_ID. Optional: AIRTABLE_COMPOUNDS_TABLE (default "Compounds").
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TABLE = process.env.AIRTABLE_COMPOUNDS_TABLE ?? "Compounds";
const BATCH_SIZE = 10; // Airtable create limit per request

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
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : join(__dirname, "..", "compounds_from_airtable.csv");

  if (pull) {
    await pullFromAirtable(token, baseId, outPath);
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
      console.error("Usage: npx tsx scripts/airtableSync.ts [path/to/top_compounds.csv] | --from-queue | --pull --out file.csv");
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
