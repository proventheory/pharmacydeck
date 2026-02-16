# Packbuilder (ingestion)

Fills the Supabase database from RxNorm, PubChem, and (optionally) DailyMed/openFDA.

## Setup

1. Copy `.env.example` to `.env` (or use the existing `.env`).
2. In **Supabase Dashboard → Project Settings → API**, copy the **service_role** key (secret).
3. Set in `.env`:
   - `SUPABASE_URL` — your project URL (already set if you used the template).
   - `SUPABASE_SERVICE_ROLE_KEY` — paste the service_role key.

## Run

From repo root:

```bash
pnpm --filter packbuilder build
pnpm --filter packbuilder ingest
```

Or with specific compound names:

```bash
pnpm --filter packbuilder ingest Ibuprofen Aspirin
```

If you see "RxCUI not found", the RxNorm API may be rate-limiting or the name may need to match their vocabulary; try again later or use exact RxNorm names.
