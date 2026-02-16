-- DDI resolution: allow unresolved "other drug" with raw name (Plan Section 2 and 5).
-- Run after 018. Adds other_drug_raw_name, resolution_status, resolution_notes; allows compound_id_b NULL for unresolved.

ALTER TABLE compound_interaction
  ADD COLUMN IF NOT EXISTS other_drug_raw_name TEXT,
  ADD COLUMN IF NOT EXISTS resolution_status TEXT DEFAULT 'resolved' CHECK (resolution_status IN ('resolved', 'unresolved', 'ambiguous')),
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

UPDATE compound_interaction SET resolution_status = 'resolved' WHERE resolution_status IS NULL;

-- Drop old constraints so we can allow compound_id_b NULL and new uniqueness rules
ALTER TABLE compound_interaction DROP CONSTRAINT IF EXISTS compound_interaction_ordered;
ALTER TABLE compound_interaction DROP CONSTRAINT IF EXISTS compound_interaction_compound_id_a_compound_id_b_key;

ALTER TABLE compound_interaction ALTER COLUMN compound_id_b DROP NOT NULL;

-- Resolved pairs: unique on (compound_id_a, compound_id_b) when both present
CREATE UNIQUE INDEX IF NOT EXISTS idx_compound_interaction_resolved_pair
  ON compound_interaction(compound_id_a, compound_id_b) WHERE compound_id_b IS NOT NULL;

-- Unresolved: one row per (compound_id_a, other_drug_raw_name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_compound_interaction_unresolved_pair
  ON compound_interaction(compound_id_a, other_drug_raw_name) WHERE compound_id_b IS NULL AND other_drug_raw_name IS NOT NULL;

-- Either resolved (both ids, ordered) or unresolved (raw name, status)
ALTER TABLE compound_interaction
  ADD CONSTRAINT compound_interaction_resolution_check CHECK (
    (compound_id_b IS NOT NULL AND compound_id_a < compound_id_b)
    OR (compound_id_b IS NULL AND resolution_status = 'unresolved' AND other_drug_raw_name IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_compound_interaction_resolution_status ON compound_interaction(resolution_status) WHERE resolution_status != 'resolved';
