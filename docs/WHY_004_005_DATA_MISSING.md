# Why regulatory, evidence, and editorial (004, 005) don’t show

The compound page and deck read from the same schema (004 regulatory/evidence, 005 editorial). Those sections only show when the corresponding tables have rows for that compound.

## Who fills the tables

| Source | Tables | Filled by |
|--------|--------|-----------|
| **004** | `compound_regulatory`, `compound_fda_label_section`, `compound_study` | **Ingest (packbuilder)** when it runs for that compound |
| **005** | `compound_editorial_reference` | **Not filled by ingest** — needs a separate sync (e.g. Pharmacy Times, Airtable) |
| **006** | `ingest_queue` | Used by bulk ingest workers; not shown on compound page |

## Ingest flow (what actually gets written)

When you run ingest for a compound (e.g. from chat: “semaglutide”):

1. **compound** + **compound_card**  
   Always written (identity, card fields from openFDA **label** snippets: mechanism, uses, safety, PK, etc.).

2. **compound_regulatory** + **compound_fda_label_section**  
   Written only if **openFDA** returns a label for that drug (`openfda.rxcui` or `openfda.substance_name`). If openFDA has no match, these stay empty.

3. **compound_study**  
   Written only if **PubMed** returns studies for the compound name. If the search returns nothing, no rows.

4. **compound_editorial_reference**  
   **Never written by ingest.** That table is for editorial/citations (e.g. Pharmacy Times); you need a separate job or sync to populate it.

So “those not showing” usually means:

- **Regulatory / FDA:** Ingest ran but openFDA had no label for that rxcui/substance, or ingest never ran for this compound.
- **Evidence / studies:** Ingest ran but PubMed returned no studies for that name, or ingest never ran.
- **Editorial:** Nothing in the repo currently writes to 005; you need your own sync.

## What to do

1. **Re-run ingest** for the compound (e.g. ask for it again by name in chat) so openFDA and PubMed are queried again and 004 tables are (re)filled if the APIs return data.
2. **Editorial (005):** Implement and run a separate sync (script or Airtable, etc.) that inserts into `compound_editorial_reference`.
3. **If it still doesn’t show:** Check Supabase that rows exist for that `compound_id` in `compound_regulatory` and `compound_study`. If they’re there and the app still doesn’t show them, the issue is in the app (e.g. wrong `compound_id` or client not reading those tables).

## Quick check in Supabase

For a given compound (e.g. semaglutide):

- `compound` → get `id` (compound_id).
- `compound_regulatory` → any row with that `compound_id`?
- `compound_study` → any rows with that `compound_id`?
- `compound_editorial_reference` → any rows with that `compound_id`?

If those are empty, ingest either didn’t run for that compound or the external APIs (openFDA, PubMed) returned no data.
