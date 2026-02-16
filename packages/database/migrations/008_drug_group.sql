-- Drug group (DrugBank-style): approved, experimental, withdrawn, etc.
-- Run after 007_compound_target.

ALTER TABLE compound
  ADD COLUMN IF NOT EXISTS drug_group TEXT
  CHECK (drug_group IS NULL OR drug_group IN (
    'approved',
    'experimental',
    'nutraceutical',
    'illicit',
    'withdrawn',
    'investigational',
    'vet_approved'
  ));

CREATE INDEX IF NOT EXISTS idx_compound_drug_group ON compound(drug_group) WHERE drug_group IS NOT NULL;
