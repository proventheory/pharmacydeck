/**
 * Fetch up to 3,000 popular compounds from OpenFDA (drug labels), resolve RxCUI where missing,
 * write CSV and optionally seed ingest_queue.
 *
 * Usage:
 *   npx tsx scripts/fetchTop3000Compounds.ts [--limit 3000] [--out path] [--seed]
 * --seed = after writing CSV, run seedIngestQueue on it (requires SUPABASE_* env).
 *
 * OpenFDA rate: 240 req/min without key. We use limit=1000 per request and ~4 requests to get 3k.
 */

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET = 3000;
const OPENFDA_PAGE_SIZE = 1000;
const OPENFDA_MAX_PAGES = 20;
const RXNAV_DELAY_MS = 200;

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

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveRxCUI(name: string): Promise<string | null> {
  const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url);
    const json = (await res.json()) as { idGroup?: { rxnormId?: string[] } };
    return json?.idGroup?.rxnormId?.[0] ?? null;
  } catch {
    return null;
  }
}

type Row = { rank: number; canonical_name: string; rxcui: string; priority_score: number; category: string };

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : TARGET;
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : join(__dirname, "..", "top_3000_compounds.csv");
  const doSeed = args.includes("--seed");

  const seenRxCUI = new Set<string>();
  const rows: Row[] = [];
  let skip = 0;
  let rank = 1;

  console.log(`Fetching up to ${limit} compounds from OpenFDA...`);

  const maxSkip = OPENFDA_MAX_PAGES * OPENFDA_PAGE_SIZE;
  while (rows.length < limit && skip < maxSkip) {
    const url = `https://api.fda.gov/drug/label.json?limit=${OPENFDA_PAGE_SIZE}&skip=${skip}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`OpenFDA ${res.status} at skip=${skip}, stopping.`);
      break;
    }
    const data = (await res.json()) as {
      results?: { openfda?: { substance_name?: string[]; rxcui?: string[]; generic_name?: string[] } }[];
    };
    const results = data.results ?? [];
    if (results.length === 0) break;

    for (const r of results) {
      const ofda = r.openfda ?? {};
      const name = ofda.substance_name?.[0] ?? ofda.generic_name?.[0];
      if (!name || name.length < 2) continue;

      const rxcuis = ofda.rxcui ?? [];
      let rxcui = rxcuis[0] ?? null;
      if (!rxcui) {
        await sleep(RXNAV_DELAY_MS);
        rxcui = await resolveRxCUI(name);
      }
      if (!rxcui || seenRxCUI.has(rxcui)) continue;
      seenRxCUI.add(rxcui);

      const canonical_name = name.trim();
      rows.push({
        rank: rank++,
        canonical_name,
        rxcui,
        priority_score: Math.max(0, 100 - Math.floor((rank * 100) / limit)),
        category: "",
      });
      if (rows.length >= limit) break;
    }

    console.log(`  Fetched ${results.length} labels, total compounds so far: ${rows.length}`);
    skip += results.length;
    if (results.length < OPENFDA_PAGE_SIZE) break;
    await sleep(500);
  }

  const csv =
    "rank,canonical_name,rxcui,priority_score,category\n" +
    rows.map((r) => `${r.rank},${r.canonical_name},${r.rxcui},${r.priority_score},${r.category}`).join("\n");
  writeFileSync(outPath, csv);
  console.log(`Wrote ${rows.length} rows to ${outPath}`);

  if (doSeed && rows.length > 0) {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set; skipping --seed.");
    } else {
      const supabase = createClient(url, key);
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize).map((r) => ({
          rxcui: r.rxcui,
          canonical_name: r.canonical_name,
          priority_score: r.priority_score,
          category: r.category || null,
          status: "pending",
          attempts: 0,
        }));
        await supabase.from("ingest_queue").upsert(batch, { onConflict: "rxcui" });
        console.log(`  Queued ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
      }
      console.log("Ingest queue seeded. Run skeletonWorker to process.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
