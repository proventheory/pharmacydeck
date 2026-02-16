-- Drug-target layer (Gap 1): target entities and compound-target links.
-- Enables target/enzyme/transporter/carrier statistics and mechanism graph.
-- Run after 002_robust_schema.

-- =============================================================================
-- TARGET (proteins, enzymes, transporters, carriers)
-- =============================================================================
CREATE TABLE IF NOT EXISTS target (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('target', 'enzyme', 'transporter', 'carrier')),
  uniprot_id TEXT,
  chembl_id TEXT,
  name TEXT NOT NULL,
  gene_symbol TEXT,
  species TEXT,
  sequence TEXT,
  source TEXT NOT NULL CHECK (source IN ('chembl', 'uniprot', 'iuphar')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT target_uniprot_unique UNIQUE (uniprot_id)
);

CREATE INDEX IF NOT EXISTS idx_target_uniprot_id ON target(uniprot_id) WHERE uniprot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_target_type ON target(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_target_chembl_id ON target(chembl_id) WHERE chembl_id IS NOT NULL;

-- =============================================================================
-- COMPOUND_TARGET (drug-target link with action)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compound_target (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES target(id) ON DELETE CASCADE,
  action TEXT CHECK (action IS NULL OR action IN ('agonist', 'antagonist', 'inhibitor', 'substrate')),
  source TEXT NOT NULL CHECK (source IN ('chembl', 'uniprot', 'iuphar')),
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(compound_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_compound_target_compound_id ON compound_target(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_target_target_id ON compound_target(target_id);
