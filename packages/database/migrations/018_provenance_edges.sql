-- Provenance and confidence on edge tables (Plan Section 1).
-- Run after 017. Creates global source_reference and adds provenance columns to edge tables.

-- =============================================================================
-- SOURCE_REFERENCE (global citable sources)
-- =============================================================================
CREATE TABLE IF NOT EXISTS source_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  url TEXT,
  title TEXT,
  published_at TIMESTAMPTZ,
  license TEXT,
  retrieved_at TIMESTAMPTZ,
  hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_reference_source_type ON source_reference(source_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_reference_type_url ON source_reference(source_type, url) WHERE url IS NOT NULL;

-- =============================================================================
-- EDGE TABLES: add provenance columns
-- =============================================================================
ALTER TABLE compound_target
  ADD COLUMN IF NOT EXISTS evidence_strength TEXT CHECK (evidence_strength IS NULL OR evidence_strength IN ('curated', 'label', 'assay', 'inferred', 'predicted')),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ref_id UUID REFERENCES source_reference(id);

ALTER TABLE compound_interaction
  ADD COLUMN IF NOT EXISTS evidence_strength TEXT CHECK (evidence_strength IS NULL OR evidence_strength IN ('curated', 'label', 'assay', 'inferred', 'predicted')),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ref_id UUID REFERENCES source_reference(id);

ALTER TABLE compound_adverse_effect
  ADD COLUMN IF NOT EXISTS evidence_strength TEXT CHECK (evidence_strength IS NULL OR evidence_strength IN ('curated', 'label', 'assay', 'inferred', 'predicted')),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ref_id UUID REFERENCES source_reference(id);

ALTER TABLE compound_trial
  ADD COLUMN IF NOT EXISTS evidence_strength TEXT CHECK (evidence_strength IS NULL OR evidence_strength IN ('curated', 'label', 'assay', 'inferred', 'predicted')),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ref_id UUID REFERENCES source_reference(id);

ALTER TABLE compound_atc
  ADD COLUMN IF NOT EXISTS evidence_strength TEXT CHECK (evidence_strength IS NULL OR evidence_strength IN ('curated', 'label', 'assay', 'inferred', 'predicted')),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ref_id UUID REFERENCES source_reference(id);

ALTER TABLE compound_indication
  ADD COLUMN IF NOT EXISTS evidence_strength TEXT CHECK (evidence_strength IS NULL OR evidence_strength IN ('curated', 'label', 'assay', 'inferred', 'predicted')),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ref_id UUID REFERENCES source_reference(id);

-- Indexes for source_ref_id lookups
CREATE INDEX IF NOT EXISTS idx_compound_target_source_ref ON compound_target(source_ref_id) WHERE source_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compound_interaction_source_ref ON compound_interaction(source_ref_id) WHERE source_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compound_adverse_effect_source_ref ON compound_adverse_effect(source_ref_id) WHERE source_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compound_trial_source_ref ON compound_trial(source_ref_id) WHERE source_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compound_atc_source_ref ON compound_atc(source_ref_id) WHERE source_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compound_indication_source_ref ON compound_indication(source_ref_id) WHERE source_ref_id IS NOT NULL;

-- Backfill retrieved_at from created_at where missing
UPDATE compound_target SET retrieved_at = created_at WHERE retrieved_at IS NULL;
UPDATE compound_interaction SET retrieved_at = created_at WHERE retrieved_at IS NULL;
UPDATE compound_adverse_effect SET retrieved_at = created_at WHERE retrieved_at IS NULL;
UPDATE compound_trial SET retrieved_at = created_at WHERE retrieved_at IS NULL;
UPDATE compound_atc SET retrieved_at = created_at WHERE retrieved_at IS NULL;
UPDATE compound_indication SET retrieved_at = created_at WHERE retrieved_at IS NULL;
