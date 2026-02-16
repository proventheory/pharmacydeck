-- PharmacyDeck Card Schema v1.0 — intelligence layer on compound_card.
-- Run after 002_robust_schema. Adds presentation/export fields and optional tables.

-- =============================================================================
-- COMPOUND_CARD: add identity, classification, mechanism, PK/PD, clinical,
-- safety, chemistry, interaction, deck stats, timeline, availability, sources
-- =============================================================================

ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS canonical_name TEXT;
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS rxcui TEXT;

ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS molecule_type TEXT
  CHECK (molecule_type IS NULL OR molecule_type IN ('small_molecule', 'peptide', 'biologic', 'prodrug'));
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS primary_class TEXT;
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS secondary_classes TEXT[] DEFAULT '{}';
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS route_forms TEXT[] DEFAULT '{}';

ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS mechanism_targets TEXT[] DEFAULT '{}';
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS mechanism_type TEXT
  CHECK (mechanism_type IS NULL OR mechanism_type IN ('agonist', 'antagonist', 'inhibitor', 'modulator'));

ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS pharmacokinetics JSONB DEFAULT '{}';
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS pharmacodynamics JSONB DEFAULT '{}';
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS clinical_profile JSONB DEFAULT '{}';
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS adverse_effect_frequency JSONB DEFAULT '{}';
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS chemistry_profile JSONB DEFAULT '{}';

ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS interaction_summary TEXT;
-- interactions_count already exists

ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS deck_stats JSONB DEFAULT '{}';
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS deck_tags TEXT[] DEFAULT '{}';

ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS approval_year INTEGER;
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS patent_expiration_year INTEGER;

ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS availability_profile JSONB DEFAULT '{}';
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS source_refs JSONB DEFAULT '[]';

ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_compound_card_slug ON compound_card(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compound_card_deck_tags ON compound_card USING GIN(deck_tags);
CREATE INDEX IF NOT EXISTS idx_compound_card_primary_class ON compound_card(primary_class) WHERE primary_class IS NOT NULL;

-- =============================================================================
-- COMPOUND_TREND (optional)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compound_trend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  trend_score NUMERIC,
  week DATE,
  month DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_trend_compound ON compound_trend(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_trend_week ON compound_trend(week);
CREATE INDEX IF NOT EXISTS idx_compound_trend_month ON compound_trend(month);

-- =============================================================================
-- COMPOUND_COMPARISON_CACHE (optional)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compound_comparison_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id_a UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  compound_id_b UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  comparison_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(compound_id_a, compound_id_b)
);

CREATE INDEX IF NOT EXISTS idx_compound_comparison_a ON compound_comparison_cache(compound_id_a);
CREATE INDEX IF NOT EXISTS idx_compound_comparison_b ON compound_comparison_cache(compound_id_b);
