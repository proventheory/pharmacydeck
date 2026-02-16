-- PDB links per target (optional; sequence already on target in 007).
-- Run after 015_compound_product.

CREATE TABLE IF NOT EXISTS target_pdb (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES target(id) ON DELETE CASCADE,
  pdb_id TEXT NOT NULL,
  source TEXT DEFAULT 'uniprot',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(target_id, pdb_id)
);

CREATE INDEX IF NOT EXISTS idx_target_pdb_target_id ON target_pdb(target_id);
CREATE INDEX IF NOT EXISTS idx_target_pdb_pdb_id ON target_pdb(pdb_id);
