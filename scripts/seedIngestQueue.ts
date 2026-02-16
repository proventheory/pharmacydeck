/**
 * Seed ingest_queue from a CSV (rank, canonical_name, rxcui, priority_score, category).
 * Idempotent: uses rxcui unique, so re-run is safe.
 *
 * Usage: npx tsx scripts/seedIngestQueue.ts [path/to/top_compounds.csv]
 * Or pull from Airtable: npx tsx scripts/seedIngestQueue.ts --from-airtable
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: AIRTABLE_* for --from-airtable.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function parseCSV(csvPath: string): { canonical_name: string; rxcui: string; priority_score: number; category: string }[] {
  const raw = readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].toLowerCase();
  const rankIdx = header.split(",").findIndex((h) => h.trim() === "rank");
  const nameIdx = header.split(",").findIndex((h) => h.trim() === "canonical_name");
  const rxcuiIdx = header.split(",").findIndex((h) => h.trim() === "rxcui");
  const scoreIdx = header.split(",").findIndex((h) => h.trim() === "priority_score");
  const catIdx = header.split(",").findIndex((h) => h.trim() === "category");
  const rows: { canonical_name: string; rxcui: string; priority_score: number; category: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const canonical_name = (nameIdx >= 0 ? cells[nameIdx] : cells[1] ?? "").trim();
    const rxcui = (rxcuiIdx >= 0 ? cells[rxcuiIdx] : cells[2] ?? "").trim();
    if (!rxcui) continue;
    const priority_score = scoreIdx >= 0 ? parseInt(cells[scoreIdx] ?? "0", 10) || 0 : 100 - (rankIdx >= 0 ? parseInt(cells[rankIdx] ?? "0", 10) || i : i);
    const category = (catIdx >= 0 ? cells[catIdx] : cells[4] ?? "").trim();
    rows.push({ canonical_name, rxcui, priority_score, category });
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," && !inQuotes) || (c === "\n" && !inQuotes)) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

async function fetchFromAirtable(): Promise<{ canonical_name: string; rxcui: string; priority_score: number; category: string }[]> {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_COMPOUNDS_TABLE ?? "Compounds";
  if (!token || !baseId) throw new Error("AIRTABLE_ACCESS_TOKEN and AIRTABLE_BASE_ID required for --from-airtable");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?pageSize=100`;
  const rows: { canonical_name: string; rxcui: string; priority_score: number; category: string }[] = [];
  let offset: string | undefined;
  do {
    const reqUrl = offset ? `${url}&offset=${offset}` : url;
    const res = await fetch(reqUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Airtable: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[]; offset?: string };
    for (const r of data.records) {
      const f = r.fields;
      const canonical_name = String(f?.canonical_name ?? f?.Name ?? f?.name ?? "").trim();
      const rxcui = String(f?.rxcui ?? f?.RxCUI ?? "").trim();
      if (!rxcui) continue;
      const priority_score = typeof f?.priority_score === "number" ? f.priority_score : parseInt(String(f?.priority_score ?? "0"), 10) || 0;
      const category = String(f?.category ?? f?.Category ?? "").trim();
      rows.push({ canonical_name, rxcui, priority_score, category });
    }
    offset = data.offset;
  } while (offset);
  return rows;
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");

  const fromAirtable = process.argv.includes("--from-airtable");
  const csvPath = process.argv.find((a) => !a.startsWith("--") && a.endsWith(".csv"));
  const defaultCsv = join(__dirname, "..", "top_compounds.csv");

  let rows: { canonical_name: string; rxcui: string; priority_score: number; category: string }[];
  if (fromAirtable) {
    console.log("Fetching compounds from Airtable...");
    rows = await fetchFromAirtable();
    console.log(`Fetched ${rows.length} rows from Airtable.`);
  } else {
    const path = csvPath ?? (existsSync(defaultCsv) ? defaultCsv : null);
    if (!path || !existsSync(path)) {
      console.error("Usage: npx tsx scripts/seedIngestQueue.ts [path/to/top_compounds.csv]");
      console.error("   Or: npx tsx scripts/seedIngestQueue.ts --from-airtable");
      process.exit(1);
    }
    rows = parseCSV(path);
  }

  const supabase = createClient(url, key);
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.map((r) => ({
      rxcui: r.rxcui,
      canonical_name: r.canonical_name || null,
      priority_score: r.priority_score,
      category: r.category || null,
      status: "pending",
      attempts: 0,
    }));
    const { error } = await supabase.from("ingest_queue").upsert(values, { onConflict: "rxcui", ignoreDuplicates: false });
    if (error) {
      console.error("Upsert error:", error.message);
      throw error;
    }
    inserted += batch.length;
    console.log(`Upserted ${inserted}/${rows.length} into ingest_queue.`);
  }
  console.log(`Done. ingest_queue seeded with ${rows.length} rows (pending).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
