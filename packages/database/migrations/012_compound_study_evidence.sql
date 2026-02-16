-- Evidence level/rank on compound_study for ranking (Gap 9).
-- Run after 011_compound_adverse_effect.

ALTER TABLE compound_study
  ADD COLUMN IF NOT EXISTS evidence_level TEXT
  CHECK (evidence_level IS NULL OR evidence_level IN (
    'meta_analysis', 'rct', 'systematic_review', 'observational', 'case_report'
  ));

ALTER TABLE compound_study
  ADD COLUMN IF NOT EXISTS evidence_rank INTEGER
  CHECK (evidence_rank IS NULL OR (evidence_rank >= 1 AND evidence_rank <= 5));

CREATE INDEX IF NOT EXISTS idx_compound_study_evidence_rank ON compound_study(evidence_rank) WHERE evidence_rank IS NOT NULL;

-- Backfill evidence_level from study_type where recognizable
UPDATE compound_study SET evidence_level = 'meta_analysis' WHERE evidence_level IS NULL AND (study_type ILIKE '%meta%' OR study_type ILIKE '%meta-analysis%');
UPDATE compound_study SET evidence_level = 'rct' WHERE evidence_level IS NULL AND (study_type ILIKE '%rct%' OR study_type ILIKE '%randomized%' OR study_type ILIKE '%clinical trial%');
UPDATE compound_study SET evidence_level = 'systematic_review' WHERE evidence_level IS NULL AND study_type ILIKE '%systematic%';
UPDATE compound_study SET evidence_level = 'observational' WHERE evidence_level IS NULL AND (study_type ILIKE '%observational%' OR study_type ILIKE '%cohort%');
UPDATE compound_study SET evidence_level = 'case_report' WHERE evidence_level IS NULL AND study_type ILIKE '%case%';
