# Top 10k compound ingest

Resumable, batched pipeline: **skeleton ingest** (compound + compound_card) then optional **enrichment** later.

## Env

In `apps/packbuilder/.env` (or repo root `.env`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — required for queue + worker
- `AIRTABLE_ACCESS_TOKEN`, `AIRTABLE_BASE_ID` — for Airtable sync (optional)

## 1. Run migration

In Supabase SQL Editor, run:

- `packages/database/migrations/006_ingest_queue.sql`

This creates `ingest_queue` and a unique index on `compound_card(slug)`.

## 2. Get a top-10k CSV

**Option A — Fetch ~3,000 from OpenFDA (popular / FDA labels) and seed queue:**

```bash
cd scripts && npm install && npx tsx fetchTop3000Compounds.ts --limit 3000 --seed
# Writes ../top_3000_compounds.csv and seeds ingest_queue (takes several minutes).
```

**Option B — Generate from priority list (small):**

```bash
cd scripts && pnpm install && pnpm run generateTopCompounds
# Writes ../top_compounds.csv (expand PRIORITY_COMPOUNDS in generateTopCompoundsCSV.ts for more)
```

**Option C — Use Airtable as source:**

1. In Airtable, create a base with a table (e.g. **Compounds**) and fields: `canonical_name`, `rxcui`, `priority_score`, `category` (and optionally `rank`).
2. Populate it (manually or import). Then pull to CSV:

```bash
pnpm run airtableSync --pull --out ../top_compounds.csv
```

**Option D — Build a full 10k list elsewhere** (e.g. RxNorm bulk + scoring), then save as CSV with columns: `rank,canonical_name,rxcui,priority_score,category`.

## 3. Sync CSV ↔ Airtable (optional)

Push your CSV to Airtable so you can structure and edit the list:

```bash
pnpm run airtableSync ../top_compounds.csv
# Or push from queue: pnpm run airtableSync --from-queue
```

## 4. Seed the queue

```bash
pnpm run seedIngestQueue ../top_compounds.csv
# Or from Airtable: pnpm run seedIngestQueue --from-airtable
```

Idempotent: re-run is safe (upsert by `rxcui`).

## 5. Run skeleton worker

**Do not run the worker inside Vercel** (timeouts). Use local, Fly, Render, or GitHub Actions.

```bash
# Process in batches of 50 until queue empty
pnpm run skeletonWorker

# One batch then exit (for cron)
pnpm run skeletonWorker --once --batch 50
```

Worker:

- Claims `pending` rows (by id), sets `processing`
- For each: upsert `compound` (rxcui, canonical_name, normalized_name), then upsert `compound_card` (slug, rxcui, canonical_name, published=true, version=1)
- Marks row `done` or `error` with `last_error`

Idempotent: safe to retry; `compound.rxcui` and `compound_card(compound_id, version)` are unique.

## 6. Enrichment (later)

Enrichment (PubChem, PubMed, FDA, deck stats) can be a separate worker that:

- Reads `ingest_queue` where `status = 'done'` (or a separate `enrichment_queue`)
- Calls your existing packbuilder/ingest or external APIs
- Updates `compound_card` and related tables
- Run at low concurrency (5–20) to respect rate limits

## Quick flow (Airtable-first)

1. Add Airtable token + base ID to `.env`.
2. Create table **Compounds** in that base with fields: `canonical_name`, `rxcui`, `priority_score`, `category`.
3. Import or manually add rows (or push from `top_compounds.csv` with `pnpm run airtableSync ../top_compounds.csv`).
4. Run migration `006_ingest_queue.sql`.
5. Seed queue from Airtable: `pnpm run seedIngestQueue --from-airtable`.
6. Run worker: `pnpm run skeletonWorker` (until queue empty).

Then you have 10k skeleton cards in PharmacyDeck; enrich top 1k first for best UX.
