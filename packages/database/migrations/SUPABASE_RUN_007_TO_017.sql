-- =============================================================================
-- Run this in Supabase SQL Editor if migrations 007–017 are not yet applied.
-- Assumes 001–006 are already applied. Run in order (or run each file 007–017).
-- =============================================================================

-- 007: target + compound_target
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

-- 008: drug_group on compound
ALTER TABLE compound
  ADD COLUMN IF NOT EXISTS drug_group TEXT
  CHECK (drug_group IS NULL OR drug_group IN (
    'approved', 'experimental', 'nutraceutical', 'illicit',
    'withdrawn', 'investigational', 'vet_approved'
  ));
CREATE INDEX IF NOT EXISTS idx_compound_drug_group ON compound(drug_group) WHERE drug_group IS NOT NULL;

-- 009: compound_interaction (DDI)
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

-- 010: compound_atc
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

-- 011: compound_adverse_effect
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

-- 012: compound_study evidence_level / evidence_rank
ALTER TABLE compound_study ADD COLUMN IF NOT EXISTS evidence_level TEXT
  CHECK (evidence_level IS NULL OR evidence_level IN ('meta_analysis', 'rct', 'systematic_review', 'observational', 'case_report'));
ALTER TABLE compound_study ADD COLUMN IF NOT EXISTS evidence_rank INTEGER
  CHECK (evidence_rank IS NULL OR (evidence_rank >= 1 AND evidence_rank <= 5));
CREATE INDEX IF NOT EXISTS idx_compound_study_evidence_rank ON compound_study(evidence_rank) WHERE evidence_rank IS NOT NULL;
UPDATE compound_study SET evidence_level = 'meta_analysis' WHERE evidence_level IS NULL AND (study_type ILIKE '%meta%' OR study_type ILIKE '%meta-analysis%');
UPDATE compound_study SET evidence_level = 'rct' WHERE evidence_level IS NULL AND (study_type ILIKE '%rct%' OR study_type ILIKE '%randomized%' OR study_type ILIKE '%clinical trial%');
UPDATE compound_study SET evidence_level = 'systematic_review' WHERE evidence_level IS NULL AND study_type ILIKE '%systematic%';
UPDATE compound_study SET evidence_level = 'observational' WHERE evidence_level IS NULL AND (study_type ILIKE '%observational%' OR study_type ILIKE '%cohort%');
UPDATE compound_study SET evidence_level = 'case_report' WHERE evidence_level IS NULL AND study_type ILIKE '%case%';

-- 013: compound_trial + compound_indication
CREATE TABLE IF NOT EXISTS compound_trial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  nct_id TEXT NOT NULL,
  title TEXT,
  phase TEXT,
  status TEXT,
  conditions TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(compound_id, nct_id)
);
CREATE INDEX IF NOT EXISTS idx_compound_trial_compound_id ON compound_trial(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_trial_nct_id ON compound_trial(nct_id);

CREATE TABLE IF NOT EXISTS compound_indication (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  condition_name_or_code TEXT NOT NULL,
  source TEXT NOT NULL,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compound_indication_compound_id ON compound_indication(compound_id);

-- 014: compound_identifier
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

-- 015: compound_product (NDC)
CREATE TABLE IF NOT EXISTS compound_product (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  ndc TEXT,
  product_ndc TEXT,
  dosage_form TEXT,
  strength TEXT,
  manufacturer TEXT,
  source TEXT DEFAULT 'openfda',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compound_product_compound_id ON compound_product(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_product_ndc ON compound_product(ndc) WHERE ndc IS NOT NULL;

-- 016: target_pdb
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

-- 017: compound_pubchem structure URLs
ALTER TABLE compound_pubchem
  ADD COLUMN IF NOT EXISTS structure_3d_url TEXT,
  ADD COLUMN IF NOT EXISTS sdf_url TEXT,
  ADD COLUMN IF NOT EXISTS mol_url TEXT;
