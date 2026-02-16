# Airtable setup for Compounds table

Use this with **Airtable AI** (or do it manually) so the **Compounds** table has exactly these columns. Our sync script expects these exact field names.

---

## Prompt to paste into Airtable AI

```
In the Compounds table, make sure these columns exist with these exact names and types. Remove or rename any other columns that don’t match. If any column is required, make it not required so we can create records via API.

- canonical_name — Single line text
- rxcui — Single line text
- priority_score — Number
- category — Single line text
- rank — Number

Do not add any other required fields (e.g. Attachment). We will import rows via API and only fill these five fields.
```

---

## Manual setup (if not using Airtable AI)

1. Open the **Compounds** table in your Pharmacy Deck base.
2. Add or rename columns so you have **exactly** these fields (names must match exactly):
   - **canonical_name** — Single line text
   - **rxcui** — Single line text
   - **priority_score** — Number
   - **category** — Single line text
   - **rank** — Number
3. Make sure **no field is required** (especially any Attachment field). Required fields will block API creates.
4. Save. Then run: `npx tsx airtableSync.ts ../top_compounds.csv` from the `scripts` folder.
