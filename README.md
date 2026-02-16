# PharmacyDeck

Pharmaceutical intelligence interface — compound exploration, comparison, and knowledge terminal for Pharmacy Time.

## Structure

- **apps/web** — Next.js app (PharmacyDeck.com). App Router, TypeScript, Tailwind.
- **apps/packbuilder** — Ingestion pipeline: RxNorm, DailyMed, openFDA, PubChem → Supabase.
- **packages/database** — Shared types, Supabase client, PostgreSQL migrations (RxCUI-centric schema).
- **packages/ui** — Shared React components (search, compound card, nav) for web, iOS, and cyberdeck.

## Setup

1. **Node** 20+ and **pnpm** (or `corepack enable pnpm`).
2. From repo root: `pnpm install`.
3. **Web:** `pnpm dev` (or `pnpm --filter web dev`). Open [http://localhost:3000](http://localhost:3000).
4. **Supabase:** Create a project, run `packages/database/migrations/001_initial.sql` in the SQL Editor.
5. **Ingestion:** Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then `pnpm --filter packbuilder build && pnpm --filter packbuilder ingest` (or pass compound names as args).

## Deploy (Vercel)

- Root directory for Vercel: **apps/web** (or set in project settings).
- Add env vars for Supabase when switching from mock data to live DB.

## Skeleton

The app runs with **mock compound data** by default (no Supabase required). After running migrations and ingestion, switch the web app to read from Supabase for real data.
