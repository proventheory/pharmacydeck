# packages/database

Shared types, Supabase client, and schema for PharmacyDeck.

## Schema

- **compound** — Core entity per RxCUI.
- **synonym** — Terms that map to RxCUI (search).
- **relationship** — RxCUI-to-RxCUI relations.
- **label_snippet** — Label text by section/source (DailyMed, openFDA).
- **pubchem** — PubChem identity link.
- **card** — Generated compound card for UI.

## Migrations

SQL migrations live in `migrations/`. Apply them in Supabase SQL Editor or via your CI:

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run `migrations/001_initial.sql`.
3. Set env vars in apps/web and apps/packbuilder:
   - `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Build

```bash
pnpm build
```
