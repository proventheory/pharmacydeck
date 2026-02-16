# 3-way sync: App ↔ Supabase ↔ Airtable

Data flows in three places and stays in sync as follows.

## Directions

| From → To | When | How |
|-----------|------|-----|
| **App (user search/open)** → **Supabase** | User asks for a compound in chat or opens a compound page | Ingest runs (packbuilder), writes `compound` + `compound_card` + `compound_regulatory` + studies. New or skeleton rows get filled. |
| **Supabase** → **Airtable** | Manual or scheduled | Run `npx tsx scripts/airtableSync.ts --from-db` to push all compounds (with card + regulatory) to Airtable. Creates or updates by `rxcui`. |
| **Airtable** → **Supabase** (optional) | When you edit the list in Airtable | Pull to CSV: `npx tsx scripts/airtableSync.ts --pull --out compounds.csv`. Then seed queue: `npx tsx scripts/seedIngestQueue.ts --from-airtable` (or use the CSV). |

So: **app use fills the DB**; **you sync DB → Airtable** to see the same data in Airtable; **Airtable can feed the queue** for bulk ingest if you want.

## Running the first sync (DB → Airtable)

1. **Airtable**
   - Create a base and a table named **Compounds** (or set `AIRTABLE_COMPOUNDS_TABLE`).
   - Add the fields from `scripts/AIRTABLE_SETUP_PROMPT.md` (canonical_name, rxcui, priority_score, category, rank, plus the rich fields for `--from-db`).
   - Create a [Personal Access Token](https://airtable.com/create/tokens) with **data.records:read** and **data.records:write** on that base (and optionally create bases/tables if you create the table via API).

2. **Env**
   - In `.env` or `apps/packbuilder/.env` set:
     - `AIRTABLE_ACCESS_TOKEN` = your token
     - `AIRTABLE_BASE_ID` = base ID (starts with `app...`)
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for `--from-db`)

3. **Run**
   ```bash
   cd scripts && npx tsx airtableSync.ts --from-db
   ```

If you get **403** from Airtable: check that the token has access to the base and table, that the base ID is correct, and that the Compounds table exists. If the table is empty, the script will create records; if it already has rows with `rxcui`, it will update them.

## Automating DB → Airtable

To keep Airtable updated as the app is used:

- Run `airtableSync.ts --from-db` on a schedule (e.g. cron every hour or daily), or
- After ingest in the app, call a small script or API that runs the same sync (e.g. a Vercel cron or external job).

No automatic trigger is set up by default; add one if you want true 3-way sync without manual runs.
