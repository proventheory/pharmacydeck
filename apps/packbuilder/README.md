# Packbuilder (ingestion)

Fills the Supabase database from RxNorm, PubChem, and (optionally) DailyMed/openFDA.

## Setup

1. Copy `.env.example` to `.env` (or use the existing `.env`).
2. In **Supabase Dashboard → Project Settings → API**:
   - Use **SUPABASE_URL** = your project URL.
   - Use **SUPABASE_SERVICE_ROLE_KEY** = the **service_role** key (the secret one), **not** the anon/publishable key.
   - If you use the publishable key, ingestion will fail with "row-level security policy" because RLS blocks writes; only the service_role key bypasses RLS.
3. Set in `.env`:
   - `SUPABASE_URL` — your project URL.
   - `SUPABASE_SERVICE_ROLE_KEY` — the **service_role** secret key (not the key that contains "publishable").

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
