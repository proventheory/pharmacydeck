# Airtable: 5 enhancement steps (post–mapping tables)

Use these with **Airtable AI** after you have the mapping tables (Search Categories, Source References, Data Packages, Regions, etc.) and the main tables (Compound Queue, Compound Metadata, Compound Sources, Compound Targets, Compound Interactions). These 5 steps add tables/columns that align with the provenance/scale plan and new DB migrations (018–023).

---

## Step 1 — Data Packages: add manifest columns

**Table:** Data Packages (must already exist from the 10-step mapping plan)

**Prompt for Airtable AI:**

```
In the Data Packages table, add these columns if they do not already exist. Use these exact names and types. Do not make any field required.

- ingest_version — Number
- compound_count — Number
- hash — Single line text
- signature — Single line text

If a column with that name already exists, leave it as is. Do not remove any existing columns.
```

**Why:** Matches DB `data_pack` (plan section 8): ingest_version, compound_count, hash, signature for pack versioning and integrity.

---

## Step 2 — Create Compound Packages table

**Prompt for Airtable AI:**

```
Create a table named Compound Packages with these columns. Do not make any field required.

- compound — Linked record to Compound Queue (or Compound Metadata), allow linking to multiple records
- product — Linked record to Compound Metadata (or leave as Single line text if you have no Products table)
- package_ndc — Single line text
- description — Long text
- source — Single line text

This table is for curating package-level NDC data (Layer 3). One row per package per compound.
```

**Why:** Mirrors DB `compound_package` (plan 10.2). Use "Compound Queue" if that’s your main compound list; otherwise "Compound Metadata."

---

## Step 3 — Create Compound FAERS Signals table

**Prompt for Airtable AI:**

```
Create a table named Compound FAERS Signals with these columns. Do not make any field required.

- compound — Linked record to Compound Queue (or Compound Metadata), allow linking to multiple records
- effect_term — Single line text
- report_count — Number
- prr — Number
- ror — Number
- source — Single line text (e.g. "faers")
- retrieved_at — Date

This table is for FAERS-reported signals only; keep separate from label adverse effects.
```

**Why:** Mirrors DB `compound_faers_signal` (plan section 7). Lets you curate or view FAERS signals per compound.

---

## Step 4 — Create Ingest Jobs table and link from Compound Queue

**Prompt for Airtable AI:**

```
Create a table named Ingest Jobs with these columns. Do not make any field required.

- job_type — Single line text (e.g. compound_ingest, product_refresh)
- compound — Linked record to Compound Queue (allow linking to multiple records)
- status — Single select: pending, running, done, failed, dead_letter
- attempts — Number
- last_error — Long text
- started_at — Date
- finished_at — Date
- created_at — Date

Then, in the Compound Queue table, add a new column: Ingest Jobs — Linked record to Ingest Jobs (allow multiple). This links queue rows to their job history.
```

**Why:** Mirrors DB `ingest_job` (plan section 9). Lets you see job history and dead-letter rows per compound.

---

## Step 5 — Compound Metadata (and optionally Compound Queue): aggregate columns

**Prompt for Airtable AI:**

```
In the Compound Metadata table, add these columns if they do not already exist. Use these exact names and types. Do not make any field required.

- target_count — Number
- adverse_effect_count — Number
- interaction_count — Number
- mechanism_targets_summary — Long text
- pharmacokinetics_summary — Long text

If a column with that name already exists, leave it as is. Do not remove any existing columns.

Optionally, in the Compound Queue table, add the same columns (target_count, adverse_effect_count, interaction_count, mechanism_targets_summary, pharmacokinetics_summary) if they do not exist.
```

**Why:** Supports sync from DB (e.g. `airtableSync.ts --from-db`) and dashboard views; matches plan Phase 12 (Airtable schema + sync). Sync script can push these aggregates from Supabase to Airtable.

---

## Summary

| Step | Table / area        | Purpose |
|------|---------------------|--------|
| 1    | Data Packages       | Add ingest_version, compound_count, hash, signature (pack manifest). |
| 2    | Compound Packages   | New table for package-NDC layer (compound, product, package_ndc, description, source). |
| 3    | Compound FAERS Signals | New table for FAERS signals (compound, effect_term, report_count, prr, ror, source, retrieved_at). |
| 4    | Ingest Jobs + Compound Queue link | New table for job history; link from Compound Queue to Ingest Jobs. |
| 5    | Compound Metadata (and optionally Queue) | Add target_count, adverse_effect_count, interaction_count, mechanism_targets_summary, pharmacokinetics_summary. |

Run in order 1 → 5. No code or DB changes required; these are Airtable-only so schema and curation stay aligned with the plan.
