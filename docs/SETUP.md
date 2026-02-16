# PharmacyDeck — What you need to do

## Do you need an OpenAI API key?

**No.** The app runs fully without it (free path).

| Feature | With `OPENAI_API_KEY` | Without (free) |
|--------|------------------------|----------------|
| **Chat** (`/chat`) | GPT summarizes and uses tools for compounds | Same compound lookup/generation; returns result as text + deck (no LLM) |
| **PK extraction** (FDA text → structured fields) | AI extracts more PK fields from label text | **Regex fallback** extracts half-life, bioavailability, metabolism, BBB, etc. |

So you can keep the product **free** and avoid API cost. Add a key later only if you want conversational chat and richer PK extraction.

---

## 1. Run migrations in Supabase SQL Editor

Run these in order in the Supabase project **SQL Editor** (Dashboard → SQL Editor → New query).  
Use the contents of each file under `packages/database/migrations/`.

1. **002_robust_schema.sql** — core tables (`compound`, `compound_card`, etc.), if not already run.
2. **003_card_schema_v1.sql** — card fields (slug, chemistry_profile, deck_stats, etc.).
3. **004_regulatory_evidence.sql** — `compound_regulatory`, `compound_fda_label_section`, `compound_study`, etc.
4. **005_compound_editorial_reference.sql** — Pharmacy Times editorial table.

If you already ran 001–004, run **005** only for the editorial layer.

---

## 2. Environment variables

**Local:** e.g. `.env` in repo root or `apps/packbuilder/.env` (and/or `apps/web/.env` if you use one).

**Vercel:** Project → Settings → Environment Variables.

| Variable | Required? | Notes |
|----------|-----------|--------|
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | For ingest and server writes. Do **not** use the anon key here. |
| `OPENAI_API_KEY` | **No** | Only for chat GPT and AI PK extraction. Omit for free operation. |

---

## 3. Install and build

From the **repo root**:

```bash
pnpm install
pnpm --filter packbuilder build
pnpm --filter web build
```

For local development:

```bash
pnpm dev
```

(Or `pnpm --filter web dev` to run only the web app.)

---

## 4. Optional: run the offline pack script

To build the SQLite pack for offline/cyberdeck:

```bash
cd scripts && pnpm install && pnpm run buildPack:tsx
```

Requires Supabase env (same as above). Writes `pharmacydeck.db` and copies to `apps/web/public/packs/`.

---

## Deploying to production (e.g. pharmacydeck.com)

**Vercel:** Set **Root Directory** to **`apps/web`** (not empty). That way Vercel sees `apps/web/package.json` and detects Next.js; otherwise you get "No Next.js version detected". Leave **Include files outside the root directory in the Build Step** enabled (for the monorepo).

The repo has `apps/web/vercel.json` with:
- **Install Command:** `pnpm install` (pnpm finds the workspace from `apps/web` and installs the whole monorepo)
- **Build Command:** `cd ../.. && pnpm run build` (runs from monorepo root so workspace filters resolve; then database → packbuilder → next build)

If you override in the dashboard, use:
- **Install Command:** `pnpm install`
- **Build Command:** `cd ../.. && pnpm run build`
- **Output Directory:** `.next` (Vercel defaults to this when root is `apps/web`)

If the build fails with exit code 2, open the deployment’s **Build** log and find the first red error line (e.g. which of `database` tsc, `packbuilder` tsc, or `next build` failed and the exact message). That will narrow down the fix.

The **live site** will only show the latest UI and API behavior after you **redeploy** from this repo.

After you push and your host (e.g. Vercel) builds and deploys, you should see:

- **Nav:** Home, Compare, My Deck, **Chat**, **Cyberdeck**
- **Home:** Subtitle line “Search below or use **Chat** to find and add compounds”
- **Search:** Works even without Supabase (falls back to mock compounds)
- **Compound pages:** “Regulatory status” (with FDA approval package links when available), “Editorial coverage” (when data exists)

If the live site still shows only “Home, Compare, My Deck” and no Chat/Cyberdeck, the deployed build is from an older commit — trigger a new deploy from the branch that has the latest code.

---

## Quick checklist

- [ ] Run migrations **004** and **005** in Supabase (and 002/003 if this is a fresh DB).
- [ ] Set **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** (local + Vercel).
- [ ] Leave **OPENAI_API_KEY** unset for the free path (or set it for chat + AI PK).
- [ ] `pnpm install` then `pnpm --filter packbuilder build` then `pnpm --filter web build` (or `pnpm dev`).
