-- 3D/SDF structure URLs for chemical visualization (Gap 10).
-- Run after 016_target_pdb.

ALTER TABLE compound_pubchem
  ADD COLUMN IF NOT EXISTS structure_3d_url TEXT,
  ADD COLUMN IF NOT EXISTS sdf_url TEXT,
  ADD COLUMN IF NOT EXISTS mol_url TEXT;
