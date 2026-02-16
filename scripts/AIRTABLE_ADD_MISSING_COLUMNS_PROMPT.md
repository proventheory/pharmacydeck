# Airtable AI prompt: add missing columns from our schema

Our database has more fields than the initial Compounds table. Paste the prompt below into **Airtable AI** so it creates any columns that are still missing. Use this after you already have the core + rich columns from `AIRTABLE_SETUP_PROMPT.md`.

---

## Prompt to paste into Airtable AI

```
In the Compounds table, add these columns if they do not already exist. Use these exact field names and types. Do not make any of them required.

Card / identity:
- slug — Single line text
- classification — Single line text

Interactions and guidelines:
- interaction_summary — Long text
- interactions_count — Number
- guideline_count — Number

Timeline (card):
- approval_year — Number
- patent_expiration_year — Number

Regulatory (FDA) — extra fields:
- approval_type — Single line text
- approval_status — Single line text
- fda_label_url — Single line text (URL)
- rems_required — Checkbox
- controlled_substance_schedule — Single line text

If a column with that name already exists, leave it as is. Do not remove or rename any existing columns.
```

---

## What these map to in our schema

| Airtable column | Source in DB |
|-----------------|--------------|
| slug | compound_card.slug |
| classification | compound_card.classification |
| interaction_summary | compound_card.interaction_summary |
| interactions_count | compound_card.interactions_count |
| guideline_count | compound_card.guideline_count |
| approval_year | compound_card.approval_year |
| patent_expiration_year | compound_card.patent_expiration_year |
| approval_type | compound_regulatory.approval_type |
| approval_status | compound_regulatory.approval_status |
| fda_label_url | compound_regulatory.fda_label_url |
| rems_required | compound_regulatory.rems_required |
| controlled_substance_schedule | compound_regulatory.controlled_substance_schedule |

After adding these columns, run `npx tsx scripts/airtableSync.ts --from-db` to push from Supabase.

---

## Compound Metadata (for 3-way sync)

If you use **Compound Metadata** and **Compound Targets** / **Compound Interactions** tables, ensure Compound Metadata has these columns (see `AIRTABLE_PRODUCTION_SCHEMA.md` for full schema):

- drug_group (Single select or Single line text)
- atc_code, unii (Single line text)
- interaction_count, target_count, enzyme_count, transporter_count, carrier_count, adverse_effect_count (Number)
- mechanism_targets_summary, pharmacokinetics_summary (Long text)

**Compound Targets** table: link to Compound Metadata (e.g. `compound`), plus: target_name, target_type, uniprot_id, action, source (Single line text).

**Compound Interactions** table: link to Compound Metadata for two compounds (e.g. `compound_a`, `compound_b`), plus: severity, description, mechanism, management, source (Single line / Long text).

Sync with: `npx tsx scripts/airtableSync.ts --from-db` (pushes Queue, Metadata, Sources, Targets, Interactions).
