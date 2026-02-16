-- ClinicalTrials.gov trials and optional indications (Gap 6).
-- Run after 012_compound_study_evidence.

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
