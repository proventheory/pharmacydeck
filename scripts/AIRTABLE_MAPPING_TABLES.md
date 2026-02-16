# Airtable mapping tables (reference and lookup)

This document lists the **mapping and reference tables** created in Airtable (Steps 1–8, 10–11 from the Airtable AI 10-step mapping plan). These tables hold curated lookup data used by the provenance/scale plan, consumer search, Data Library, Clinical API, and UX. Main sync tables (Compound Queue, Compound Metadata, Compound Sources, Compound Targets, Compound Interactions) are described in [AIRTABLE_PRODUCTION_SCHEMA.md](AIRTABLE_PRODUCTION_SCHEMA.md).

---

## Plan section mapping

| Table | Plan section | Purpose |
|-------|--------------|---------|
| Search Categories | 13 (Consumer-facing search) | Map internal search modes (drugs, targets, pathways, indications) to consumer labels and descriptions for UI. |
| Source References | 1 (Provenance) | Citable sources (APIs, labels, papers) for edge provenance; can feed DB `source_reference`. |
| Data Packages | 16.2 (Data Library structure) | Base / Add-on / Third Party packages; preview text for Data Library. Linked from Compound Metadata and Compound Queue (Step 11). |
| Clinical API Modules | 17 (Clinical API) | List of Clinical API modules (base + add-ons) for docs and UI. |
| Regions | 17.5 (Multi-region) | Regions for API and offline packs. Linked from Compound Metadata and Compound Queue (Step 11). |
| Label Section Types | 17.3 (US Drug Labels) | FDA label section types (patient guide, supplementary, health professional) for API/UI. |
| Target Action Vocabulary | 4 (compound_target action) | Normalized action codes (agonist, antagonist, etc.) with display labels for ingest and UI. |
| Evidence Strength Lookup | 1 (Provenance) | evidence_strength codes and default confidence for edge tables and ingest. |
| Identifier Mappings | 17.6 (Cross-mapping) | Condition/adverse effect → SNOMED-CT, MedDRA, ICD-10 (external licenses may apply). |
| Compound Metadata — Regions, Data Packages links | 11 (enhancement) | Per-compound: which regions and which data packages (links to Regions and Data Packages tables). |
| Compound Queue — Regions, Data Packages links | 11 (enhancement) | Same links on queue for filtering/curation. |

---

## Tables that link to compounds

Only **Regions** and **Data Packages** are associated with compounds:

- **Compound Metadata** has link fields **Regions** and **Data Packages** (multiple records allowed).
- **Compound Queue** has link fields **Regions** and **Data Packages** (multiple records allowed).

All other mapping tables above are global lookups (no link to Compound Queue or Compound Metadata).

---

## Usage

- **Reference data:** Export mapping tables to JSON/CSV and load into the app or DB when implementing each plan section, or add optional sync (e.g. Source References → Supabase `source_reference`).
- **Regions / Data Packages:** Curate in Airtable per compound; later you can add sync logic to push region/package assignments from DB to these link fields, or keep them Airtable-only for packaging and filtering.

---

## Follow-up: 5 enhancement steps

After the mapping tables and Compound Queue/Metadata links (Steps 1–11), run the **5 Airtable AI steps** in [AIRTABLE_5_STEPS_ENHANCEMENT.md](AIRTABLE_5_STEPS_ENHANCEMENT.md) to add:

- Data Packages manifest columns (ingest_version, compound_count, hash, signature)
- Compound Packages table (package-NDC layer)
- Compound FAERS Signals table
- Ingest Jobs table + link from Compound Queue
- Compound Metadata (and optionally Queue) aggregate columns (target_count, adverse_effect_count, interaction_count, mechanism_targets_summary, pharmacokinetics_summary)
