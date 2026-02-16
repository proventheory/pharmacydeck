/**
 * Generate top compounds CSV: rank, canonical_name, rxcui, priority_score, category.
 * Resolves RxCUI via RxNav. Run: npx tsx scripts/generateTopCompoundsCSV.ts [--limit N] [--out path]
 *
 * Expand PRIORITY_COMPOUNDS or pipe in a list; for full 10k you'd merge with RxNorm bulk + scoring.
 */

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRIORITY_COMPOUNDS: { name: string; category?: string }[] = [
  { name: "Semaglutide", category: "Metabolic" },
  { name: "Tirzepatide", category: "Metabolic" },
  { name: "Metformin", category: "Metabolic" },
  { name: "Sildenafil", category: "Sexual Health" },
  { name: "Tadalafil", category: "Sexual Health" },
  { name: "Testosterone", category: "Hormone" },
  { name: "Estradiol", category: "Hormone" },
  { name: "Progesterone", category: "Hormone" },
  { name: "Finasteride", category: "Hormone" },
  { name: "Minoxidil", category: "Hormone" },
  { name: "Fluoxetine", category: "Psych" },
  { name: "Sertraline", category: "Psych" },
  { name: "Adderall", category: "Psych" },
  { name: "Modafinil", category: "Psych" },
  { name: "Atorvastatin", category: "Cardiovascular" },
  { name: "Lisinopril", category: "Cardiovascular" },
  { name: "Amoxicillin", category: "Antibiotic" },
  { name: "Azithromycin", category: "Antibiotic" },
  { name: "Rapamycin", category: "Longevity" },
  { name: "Ketamine", category: "Psych" },
];

async function resolveRxCUI(name: string): Promise<string | null> {
  const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url);
    const json = (await res.json()) as { idGroup?: { rxnormId?: string[] } };
    return json?.idGroup?.rxnormId?.[0] ?? null;
  } catch (e) {
    console.warn(`RxCUI resolve failed for "${name}":`, (e as Error).message);
    return null;
  }
}

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

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : undefined;
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : join(__dirname, "..", "top_compounds.csv");

  const list = limit ? PRIORITY_COMPOUNDS.slice(0, limit) : PRIORITY_COMPOUNDS;
  const rows: { rank: number; canonical_name: string; rxcui: string | null; priority_score: number; category: string }[] = [];
  let rank = 1;
  for (const { name, category } of list) {
    const rxcui = await resolveRxCUI(name);
    rows.push({
      rank,
      canonical_name: name,
      rxcui,
      priority_score: Math.max(0, 100 - rank),
      category: category ?? "",
    });
    rank++;
  }

  const csv =
    "rank,canonical_name,rxcui,priority_score,category\n" +
    rows.map((r) => `${r.rank},${r.canonical_name},${r.rxcui ?? ""},${r.priority_score},${r.category}`).join("\n");

  writeFileSync(outPath, csv);
  console.log(`Wrote ${rows.length} rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
