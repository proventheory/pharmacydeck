# Airtable production schema — control plane + data plane + sources

Use this with **Airtable AI** or set up manually. Your real database is **Supabase**; Airtable is the **ingestion dashboard**.

---

## Architecture

```
Compound Queue (control)  →  Agent enriches  →  Supabase  →  SQLite Pack  →  App
Compound Metadata (data)       citations       Compound Sources (references)
```

---

## 1. Compound Queue (control plane)

**Table name:** `Compound Queue` (or keep `Compounds` as queue if you prefer)

Tells the agent what to fetch, when, and whether it succeeded.

| Field | Type | Notes |
|-------|------|--------|
| canonical_name | Single line text | |
| rxcui | Single line text | Unique identity from RxNorm |
| priority_score | Number | 0–100, for ordering |
| category | Single line text | e.g. Metabolic, Psych |
| rank | Number | Optional |
| slug | Single line text | URL-safe id, e.g. `semaglutide` |
| status | Single select | pending \| processing \| done \| error |
| attempts | Number | Retry count |
| last_enriched_at | DateTime | Last time enrichment ran |
| next_retry_at | DateTime | When to retry if error |
| error | Long text | Last error message |
| synced_to_pack | Checkbox | True when included in offline pack |
| compound_metadata | Link to Compound Metadata | Optional link to data record |

---

## 2. Compound Metadata (data plane)

**Table name:** `Compound Metadata`

Stores structured compound data. Add these **6 fields** if missing:

| Field | Type | Why |
|-------|------|-----|
| **compound_uuid** | Formula or Single line text | Permanent id, e.g. `cmp_9f3a2c1d`. Everything (Supabase, pack, API) should reference this. |
| **rxcui** | Single line text | Keep here too; queue may change, metadata must retain identity. |
| **pubchem_cid** | Number | For molecule rendering, SMILES, structure, linking. |
| **last_updated_at** | DateTime | Refresh cycles, stale detection, re-ingestion. |
| **data_completeness_score** | Number 0–100 | e.g. Semaglutide=98, rare drug=42. Agent updates; powers prioritization and deck rarity. |
| **ingestion_version** | Number | 1, 2, 3… Increment when pipeline improves; allows rebuilding packs. |
| **is_published** | Checkbox | **Critical.** `false` = still generating, `true` = ready for public. Never show incomplete compounds. |

Plus your existing fields (canonical_name, mechanism, uses, etc.).

---

## 3. Compound Sources (citations)

**Table name:** `Compound Sources`

Stores references for “Sources” / “Scientific backing” in the app.

| Field | Type |
|-------|------|
| compound_uuid | Single line text (or link to Compound Metadata) |
| source_type | Single select: PubMed, FDA, DailyMed, PubChem, PharmacyTimes |
| source_url | URL |
| title | Single line text |
| published_date | Date |
| credibility_score | Number |
| **rxcui** | Single line text — compound identity; set when creating citation records |
| **Compound Metadata** (linked record) | Link to Compound Metadata — associates each source row with one compound |

---

## Prompt to paste into Airtable AI

```
Set up these three tables for Pharmacy Deck ingestion.

1) Compound Queue (control plane)
Ensure these columns exist with these exact names: canonical_name, rxcui, priority_score, category, rank, slug, status (single select: pending, processing, done, error), attempts (number), last_enriched_at (datetime), next_retry_at (datetime), error (long text), synced_to_pack (checkbox), compound_metadata (link to Compound Metadata if that table exists).
No required fields so we can create records via API.

2) Compound Metadata (data plane)
Add these columns if they don’t exist: compound_uuid (formula or text, unique id like cmp_9f3a2c1d), rxcui (single line text), pubchem_cid (number), last_updated_at (datetime), data_completeness_score (number 0–100), ingestion_version (number), is_published (checkbox). is_published must exist: false = still generating, true = ready for public. No required fields that would block API writes.

3) Compound Sources (citations)
Ensure "Compound Sources" has: compound_uuid (text or link to Compound Metadata), source_type (single select: PubMed, FDA, DailyMed, PubChem, PharmacyTimes), source_url (url), title (single line text), published_date (date), credibility_score (number), rxcui (single line text), and a linked record field to Compound Metadata so each source row is associated with one compound. No required fields.

Do not add required Attachment or other required fields that would block API record creation.
```

---

## Flow

- **Airtable Queue** = what to ingest and status.
- **Agent** enriches from Queue → writes to **Supabase** (and can sync back to Compound Metadata for visibility).
- **Supabase** = source of truth for app and pack build.
- **Compound Sources** = citations for the app “Sources” section.

Your Supabase schema already has `compound` (id = UUID), `compound_card` (published), and related tables; keep using those as the real database. Airtable is the dashboard and optional sync target.
