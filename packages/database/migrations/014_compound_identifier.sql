-- Cross-identifier table: rxcui, pubchem_cid, unii, atc, mesh, ndc (Gap 8).
-- Run after 013_compound_trial_indication.

CREATE TABLE IF NOT EXISTS compound_identifier (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  id_type TEXT NOT NULL CHECK (id_type IN ('rxcui', 'pubchem_cid', 'unii', 'atc', 'mesh', 'ndc')),
  id_value TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(compound_id, id_type)
);

CREATE INDEX IF NOT EXISTS idx_compound_identifier_compound_id ON compound_identifier(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_identifier_type_value ON compound_identifier(id_type, id_value);
