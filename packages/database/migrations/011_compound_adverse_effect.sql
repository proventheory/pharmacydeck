-- Structured adverse effects per compound (label + optional FAERS).
-- Run after 010_compound_atc.

CREATE TABLE IF NOT EXISTS compound_adverse_effect (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  effect_term TEXT NOT NULL,
  frequency TEXT,
  severity TEXT,
  source TEXT NOT NULL CHECK (source IN ('dailymed', 'faers', 'label')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_adverse_effect_compound_id ON compound_adverse_effect(compound_id);
