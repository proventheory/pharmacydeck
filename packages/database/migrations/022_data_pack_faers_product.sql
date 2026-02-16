-- Data pack manifest, FAERS signals, compound_product extension (Plan Sections 7, 8, 10).
-- Run after 021.

-- =============================================================================
-- DATA_PACK: ingest_version, compound_count, hash, signature
-- =============================================================================
ALTER TABLE data_pack ADD COLUMN IF NOT EXISTS ingest_version INT;
ALTER TABLE data_pack ADD COLUMN IF NOT EXISTS compound_count INT;
ALTER TABLE data_pack ADD COLUMN IF NOT EXISTS hash TEXT;
ALTER TABLE data_pack ADD COLUMN IF NOT EXISTS signature TEXT;

-- =============================================================================
-- COMPOUND_FAERS_SIGNAL (reported signals; separate from label adverse effects)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compound_faers_signal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  effect_term TEXT NOT NULL,
  report_count INT,
  prr NUMERIC,
  ror NUMERIC,
  source TEXT DEFAULT 'faers',
  retrieved_at TIMESTAMPTZ,
  source_ref_id UUID REFERENCES source_reference(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_faers_signal_compound_id ON compound_faers_signal(compound_id);

-- =============================================================================
-- COMPOUND_PRODUCT: brand_name, generic_name, route, approval_status, application_number
-- =============================================================================
ALTER TABLE compound_product ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE compound_product ADD COLUMN IF NOT EXISTS generic_name TEXT;
ALTER TABLE compound_product ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE compound_product ADD COLUMN IF NOT EXISTS approval_status TEXT;
ALTER TABLE compound_product ADD COLUMN IF NOT EXISTS application_number TEXT;
ALTER TABLE compound_product ADD COLUMN IF NOT EXISTS source_ref_id UUID REFERENCES source_reference(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compound_product_compound_ndc
  ON compound_product(compound_id, ndc) WHERE ndc IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_compound_product_compound_product_ndc
  ON compound_product(compound_id, product_ndc) WHERE product_ndc IS NOT NULL;
