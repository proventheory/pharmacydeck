# Deploy and Supabase SQL

## Deploy (Vercel)

From repo root (requires pnpm):

```bash
pnpm install
pnpm run build
```

Then either:

- **Vercel CLI:** `vercel --prod` (from repo root; links to your Vercel project)
- **Git:** Push to your connected branch; Vercel will run `pnpm run build` and deploy from `apps/web/.next`

Root `vercel.json` uses `buildCommand: pnpm run build` and `outputDirectory: apps/web/.next`.

---

## Supabase SQL — what to run

- **Already applied (you ran this):** [SUPABASE_RUN_007_TO_017.sql](packages/database/migrations/SUPABASE_RUN_007_TO_017.sql) — migrations 007 through 017 (compound_target, drug_group, compound_interaction, compound_atc, compound_adverse_effect, compound_study evidence, compound_trial, compound_indication, compound_identifier, compound_product, target_pdb, compound_structure_assets).

- **No new SQL this release:** The only changes in this session were docs (AIRTABLE_MAPPING_TABLES.md, AIRTABLE_PRODUCTION_SCHEMA.md). There are no new migration files (no 018+). So **no additional SQL needs to be run on Supabase** for this deploy.

- **If this is a fresh Supabase project:** Run migrations in order: 001 → 002 (robust schema) → 003–006, then 007–017 (or use the combined SUPABASE_RUN_007_TO_017.sql after 001–006). Do not re-run 007–017 if already applied.

- **Future (from the plan):** Migrations like `018_provenance_edges.sql`, DDI resolution columns, target organism/aliases, etc. are not yet in the repo; when added, run them in Supabase after 017.
