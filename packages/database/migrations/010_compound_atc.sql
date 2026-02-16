-- ATC (Anatomical Therapeutic Chemical) classification per compound.
-- Run after 009_compound_interaction.

CREATE TABLE IF NOT EXISTS compound_atc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  atc_code TEXT NOT NULL,
  atc_name TEXT,
  level INTEGER,
  source TEXT DEFAULT 'rxclass',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(compound_id, atc_code)
);

CREATE INDEX IF NOT EXISTS idx_compound_atc_compound_id ON compound_atc(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_atc_code ON compound_atc(atc_code);
