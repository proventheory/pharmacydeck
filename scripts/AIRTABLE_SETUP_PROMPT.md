# Airtable setup for Compounds table

Use this with **Airtable AI** (or do it manually) so the **Compounds** table has these columns. Our sync script pushes data from Supabase (DB → Airtable) with `--from-db`.

---

## Prompt to paste into Airtable AI

```
In the Compounds table, make sure these columns exist with these exact names and types. If any column is required, make it not required so we can create/update records via API.

Core (required for sync):
- canonical_name — Single line text
- rxcui — Single line text
- priority_score — Number
- category — Single line text
- rank — Number

Rich data (filled by --from-db sync from our database):
- mechanism_summary — Long text
- uses_summary — Long text
- safety_summary — Long text
- primary_class — Single line text
- molecule_type — Single line text
- regulatory_summary — Long text
- approval_date — Single line text
- fda_application_number — Single line text
- boxed_warning — Checkbox
- study_count — Number
- evidence_summary — Long text

Do not add any other required fields. We will sync from our app database and fill these fields.
```

---

## Manual setup (if not using Airtable AI)

1. Open the **Compounds** table in your Pharmacy Deck base.
2. Add columns so you have these fields (names must match exactly):
   - **canonical_name**, **rxcui**, **priority_score**, **category**, **rank**
   - **mechanism_summary**, **uses_summary**, **safety_summary** (Long text)
   - **primary_class**, **molecule_type**, **regulatory_summary**, **approval_date**, **fda_application_number**, **evidence_summary**
   - **boxed_warning** (Checkbox), **study_count** (Number)
3. Make sure **no field is required** (especially any Attachment field).
4. Save. Then run the first sync (see below).

---

## Optional: one prompt for full schema (all columns)

If you want the Compounds table to have every column that matches our database schema (including the ones we sync with `--from-db`), use the prompt in **AIRTABLE_ADD_MISSING_COLUMNS_PROMPT.md** after the prompt above, or use this single “full schema” prompt:

```
In the Compounds table, ensure these columns exist with these exact names and types. Do not make any field required.

Core: canonical_name, rxcui, priority_score, category, rank (Single line text for text fields, Number for score/rank).

Rich card: mechanism_summary, uses_summary, safety_summary, primary_class, molecule_type, regulatory_summary, evidence_summary (Long text for summaries, Single line for class/type). approval_date, fda_application_number (Single line text). boxed_warning (Checkbox). study_count (Number).

Extra card: slug, classification, interaction_summary (Single line or Long text). interactions_count, guideline_count, approval_year, patent_expiration_year (Number).

Extra regulatory: approval_type, approval_status, fda_label_url (Single line text). rems_required (Checkbox). controlled_substance_schedule (Single line text).

If a column already exists, leave it. Add any that are missing.
```

---

## First sync (DB → Airtable)

From repo root, with `.env` (or `apps/packbuilder/.env`) containing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AIRTABLE_ACCESS_TOKEN`, `AIRTABLE_BASE_ID`:

```bash
cd scripts && npx tsx airtableSync.ts --from-db
```

This pushes all compounds from Supabase (with latest card + regulatory) to Airtable, creating or updating by `rxcui`. Re-run anytime to refresh Airtable from the database.
