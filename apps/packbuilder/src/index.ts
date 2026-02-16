/**
 * PharmacyDeck ingestion pipeline (packbuilder).
 * Usage: pnpm ingest (with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set)
 * Or: node dist/index.js [compound1] [compound2] ...
 */
import "dotenv/config";
import { ingestCompound } from "./ingest.js";

const DEFAULT_LIST = [
  "Semaglutide",
  "Tirzepatide",
  "Metformin",
  "Testosterone",
  "Enclomiphene",
];

async function main() {
  const args = process.argv.slice(2);
  const names = args.length > 0 ? args : DEFAULT_LIST;

  const hasEnv =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!hasEnv) {
    console.error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL and key) to run ingestion."
    );
    process.exit(1);
  }

  console.log("Ingesting:", names.join(", "));
  for (const name of names) {
    const result = await ingestCompound(name);
    if (result.ok) {
      console.log(`  OK ${result.canonical_name} (RxCUI ${result.rxcui})`);
    } else {
      console.error(`  FAIL ${name}: ${result.error ?? "unknown"}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
