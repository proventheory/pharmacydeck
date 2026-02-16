# Airtable production schema (implemented)

This document describes the **implemented** Airtable base schema used for 3-way sync (Airtable ↔ Supabase ↔ app). Supabase is the source of truth; Airtable is the ingestion dashboard and curation surface. Sync script: `scripts/airtableSync.ts` (push from CSV/queue/DB, pull to CSV).

---

## Architecture

```
Compound Queue (control)  →  Agent enriches  →  Supabase  →  SQLite Pack  →  App
Compound Metadata (data)  ←  sync scripts    →  Compound Targets, Compound Interactions, Compound Sources
```

---

## 1. Compound Metadata (data plane)

**Table name:** `Compound Metadata`

Stores structured compound data. All columns below are implemented for parity and sync.

| Field | Type | Notes |
|-------|------|--------|
| compound_uuid | Formula or Single line text | Permanent id; reference from pack/API. |
| rxcui | Single line text | Identity from RxNorm. |
| pubchem_cid | Number | For molecule rendering, SMILES, linking. |
| last_updated_at | DateTime | Refresh / re-ingestion. |
| data_completeness_score | Number 0–100 | Agent-updated; prioritization. |
| ingestion_version | Number | 1, 2, 3… Pipeline version. |
| is_published | Checkbox | false = still generating, true = ready for public. |
| drug_group | Single select | Approved, Experimental, Nutraceutical, Illicit, Withdrawn, Investigational, Vet Approved. |
| atc_code | Single line text | WHO ATC classification. |
| unii | Single line text | UNII identifier. |
| interaction_count | Number | Count of drug–drug interactions. |
| target_count | Number | Count of targets (receptors). |
| enzyme_count | Number | Count of enzymes. |
| transporter_count | Number | Count of transporters. |
| carrier_count | Number | Count of carriers. |
| adverse_effect_count | Number | Count of structured adverse effects. |
| mechanism_targets_summary | Long text | Summary of targets for display. |
| pharmacokinetics_summary | Long text | Summary of PK for display. |
| canonical_name | Single line text | Plus other display fields (mechanism_summary, uses_summary, etc.) as needed. |
| Regions | Link to Regions | Multiple. Which regions this compound is available in (products/approval/packs). |
| Data Packages | Link to Data Packages | Multiple. Which data packages include this compound (e.g. Offline Pack US). |

No required validations that block API writes.

---

## 2. Compound Queue (control plane)

**Table name:** `Compound Queue` (or `Compounds` if used as queue)

Tells the agent what to fetch and status. All columns below are implemented.

| Field | Type | Notes |
|-------|------|--------|
| canonical_name | Single line text | |
| rxcui | Single line text | Unique identity from RxNorm. |
| priority_score | Number | 0–100, for ordering. |
| category | Single line text | e.g. Metabolic, Psych. |
| rank | Number | Optional. |
| slug | Single line text | URL-safe id, e.g. `semaglutide`. |
| status | Single select | pending, processing, done, error. |
| attempts | Number | Retry count. |
| last_enriched_at | DateTime | Last time enrichment ran. |
| next_retry_at | DateTime | When to retry if error. |
| error | Long text | Last error message. |
| synced_to_pack | Checkbox | True when included in offline pack. |
| compound_metadata | Link to Compound Metadata | Link to data record. |
| drug_group | Single select | Optional; pre-assign before ingest. |
| Regions | Link to Regions | Multiple. Optional; filter/curate by region. |
| Data Packages | Link to Data Packages | Multiple. Optional; filter/curate by package. |

No required fields that block API sync.

---

## 3. Compound Sources (citations)

**Table name:** `Compound Sources`

Stores references for “Sources” / “Scientific backing” in the app.

| Field | Type | Notes |
|-------|------|--------|
| compound_uuid or link to Compound Metadata | Link / Single line text | Associates source with compound. |
| source_type | Single select | PubMed, FDA, DailyMed, PubChem, PharmacyTimes, ClinicalTrials.gov. |
| source_url | URL | |
| title | Single line text | |
| published_date | Date | |
| credibility_score | Number | |
| rxcui | Single line text | Compound identity when creating records. |

No required fields that block API sync.

---

## 4. Compound Targets

**Table name:** `Compound Targets`

Filled by sync from the database so you can view and filter drug–target, drug–enzyme, drug–transporter, and drug–carrier data in Airtable.

| Field | Type | Notes |
|-------|------|--------|
| compound | Link to Compound Metadata | |
| target_name | Single line text | |
| target_type | Single select | target, enzyme, transporter, carrier. |
| uniprot_id | Single line text | |
| action | Single select | agonist, antagonist, inhibitor, substrate, or blank. |
| source | Single line text | e.g. ChEMBL, UniProt. |

---

## 5. Compound Interactions

**Table name:** `Compound Interactions`

Filled by sync from the database so you can view drug–drug interactions in Airtable.

| Field | Type | Notes |
|-------|------|--------|
| compound_a | Link to Compound Metadata | |
| compound_b | Link to Compound Metadata | |
| severity | Single select | major, moderate, minor, unknown. |
| description | Long text | |
| mechanism | Long text | |
| management | Long text | |
| source | Single line text | |

---

## Sync script usage

- **Push from DB to Airtable (all tables):**  
  `npx tsx scripts/airtableSync.ts --from-db`
- **Push only to specific tables:**  
  `npx tsx scripts/airtableSync.ts --from-db --to queue --to metadata --to sources`  
  Optional: `--to targets`, `--to interactions` when Supabase has `compound_target`/`target` and `compound_interaction` (or equivalent).
- **Push from queue or CSV:**  
  `npx tsx scripts/airtableSync.ts ../top_compounds.csv` or `--from-queue`
- **Pull from Airtable to CSV:**  
  `npx tsx scripts/airtableSync.ts --pull --out compounds_from_airtable.csv`

Env: `AIRTABLE_ACCESS_TOKEN`, `AIRTABLE_BASE_ID`. Optional: `AIRTABLE_COMPOUNDS_TABLE` (default `Compounds`), `AIRTABLE_METADATA_TABLE` (`Compound Metadata`), `AIRTABLE_SOURCES_TABLE` (`Compound Sources`), `AIRTABLE_TARGETS_TABLE` (`Compound Targets`), `AIRTABLE_INTERACTIONS_TABLE` (`Compound Interactions`).

---

## Mapping tables (reference and lookup)

Additional tables for search categories, provenance, Data Library, Clinical API, regions, and cross-mappings are documented in [AIRTABLE_MAPPING_TABLES.md](AIRTABLE_MAPPING_TABLES.md). They include: Search Categories, Source References, Data Packages, Clinical API Modules, Regions, Label Section Types, Target Action Vocabulary, Evidence Strength Lookup, Identifier Mappings. Compound Metadata and Compound Queue link to **Regions** and **Data Packages** (see fields above).

---

## Five steps (reference — already applied)

The base is configured using these five steps (for reference or re-application in another base):

**Step 1 — Compound Metadata:** Add columns: drug_group (Single select: Approved, Experimental, Nutraceutical, Illicit, Withdrawn, Investigational, Vet Approved); atc_code, unii (Single line text); interaction_count, target_count, enzyme_count, transporter_count, carrier_count, adverse_effect_count (Number); mechanism_targets_summary, pharmacokinetics_summary (Long text). Keep: compound_uuid, rxcui, pubchem_cid, data_completeness_score, last_updated_at, ingestion_version, is_published. No required validations that block API writes.

**Step 2 — Compound Queue:** Ensure columns: canonical_name, rxcui, priority_score, category, rank, slug; status (Single select: pending, processing, done, error); attempts (Number); last_enriched_at, next_retry_at (DateTime); error (Long text); synced_to_pack (Checkbox); compound_metadata (Link to Compound Metadata). Optional: drug_group. No required fields that block API sync.

**Step 3 — Compound Sources:** Ensure columns: compound_uuid or link to Compound Metadata; source_type (Single select: PubMed, FDA, DailyMed, PubChem, PharmacyTimes, ClinicalTrials.gov); source_url (URL); title (Single line text); published_date (Date); credibility_score (Number). No required fields that block API sync.

**Step 4 — Compound Targets:** Table with: compound (Link to Compound Metadata); target_name (Single line text); target_type (Single select: target, enzyme, transporter, carrier); uniprot_id (Single line text); action (Single select: agonist, antagonist, inhibitor, substrate, or blank); source (Single line text).

**Step 5 — Compound Interactions:** Table with: compound_a, compound_b (Link to Compound Metadata); severity (Single select: major, moderate, minor, unknown); description, mechanism, management (Long text); source (Single line text).
