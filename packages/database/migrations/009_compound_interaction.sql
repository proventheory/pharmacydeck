-- Structured drug-drug interactions (DDI): severity, mechanism, management.
-- Run after 008_drug_group. Store canonical pair (compound_id_a < compound_id_b).

CREATE TABLE IF NOT EXISTS compound_interaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id_a UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  compound_id_b UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  severity TEXT CHECK (severity IS NULL OR severity IN ('major', 'moderate', 'minor', 'unknown')),
  description TEXT,
  mechanism TEXT,
  management TEXT,
  source TEXT NOT NULL CHECK (source IN ('dailymed', 'openfda', 'dikb')),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT compound_interaction_ordered CHECK (compound_id_a < compound_id_b),
  UNIQUE(compound_id_a, compound_id_b)
);

CREATE INDEX IF NOT EXISTS idx_compound_interaction_a ON compound_interaction(compound_id_a);
CREATE INDEX IF NOT EXISTS idx_compound_interaction_b ON compound_interaction(compound_id_b);
