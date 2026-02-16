# Robust Schema — Next Steps

The repo is now aligned with the **robust schema** (RxCUI as canonical identity on `compound`; everything else keys off `compound.id`). Use this checklist.

---

## 1. Apply the new schema in Supabase

**Warning:** Migration `002_robust_schema.sql` **drops** the old tables (`compound`, `synonym`, `relationship`, `label_snippet`, `pubchem`, `card`). If you have data you care about, export it first or run a one-off migration script to move it into the new tables.

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Open `packages/database/migrations/002_robust_schema.sql` in your editor.
3. Copy the **entire** file and paste into the SQL Editor.
4. Click **Run**. You should see no errors.
5. In **Table Editor**, confirm the new tables exist:  
   `compound`, `compound_synonym`, `compound_relation`, `compound_pubchem`, `compound_label_snippet`, `compound_card`, `compound_source_reference`, `compound_search_index`, `data_pack`, `data_pack_compound`, `user_deck`, `user_deck_item`, `compound_ai_cache`.

---

## 2. Re-run ingestion

After the new schema is applied, the old data is gone. Re-populate with the packbuilder:

```bash
pnpm --filter packbuilder build
pnpm --filter packbuilder ingest
```

Optional: pass compound names as arguments:

```bash
pnpm --filter packbuilder ingest Semaglutide Metformin Ibuprofen
```

Ingestion now writes to:

- `compound` (rxcui, canonical_name, normalized_name, status)
- `compound_synonym` (source: rxnorm)
- `compound_relation` (relation_type from RxNorm tty)
- `compound_label_snippet` (append-only; section_type mapped)
- `compound_pubchem`
- `compound_card` (versioned; each run inserts a new version)
- `compound_source_reference` (rxnorm, openfda)

---

## 3. Web app and API

The web app and `/api/compounds` already use the new schema:

- **Compound list / compare / deck:** Read from `compound` (status = active) and latest `compound_card` (max `version` per `compound_id`).
- **Compound page by slug:** Resolve slug from `compound.canonical_name` / `normalized_name`, then load latest card.
- **My Deck:** Still uses localStorage; API returns compounds by RxCUI using the new tables.

No code changes are required for basic flows after the migration is applied.

---

## 4. Optional: backfill `compound_search_index`

The trigger keeps `compound_search_index` in sync when `compound` or `compound_synonym` change. For existing rows (e.g. if you had run ingestion before the trigger existed), you can backfill once:

```sql
INSERT INTO compound_search_index (compound_id, search_vector)
SELECT c.id, (
  setweight(to_tsvector('english', coalesce(c.canonical_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(c.normalized_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(string_agg(cs.synonym, ' '), '')), 'B')
)
FROM compound c
LEFT JOIN compound_synonym cs ON cs.compound_id = c.id
GROUP BY c.id, c.canonical_name, c.normalized_name
ON CONFLICT (compound_id) DO UPDATE SET search_vector = EXCLUDED.search_vector;
```

---

## 5. Later: offline pack export, user decks, AI cache

- **data_pack / data_pack_compound:** When you implement pack export (Postgres → SQLite), create a row in `data_pack` and fill `data_pack_compound` for each compound in that pack.
- **user_deck / user_deck_item:** When you add auth, migrate “saved” compounds from localStorage (or anon id) into `user_deck` and `user_deck_item`.
- **compound_ai_cache:** When you add the AI layer, cache responses keyed by `compound_id` + `query_hash` and read from here before calling the model.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Run `002_robust_schema.sql` in Supabase (drops old tables, creates new ones). |
| 2 | Run `pnpm --filter packbuilder ingest` to re-populate. |
| 3 | Confirm the site and deck work; no code changes needed. |
| 4 | (Optional) Backfill `compound_search_index` if needed. |
| 5 | Use `data_pack`, `user_deck`, `compound_ai_cache` when you add those features. |
