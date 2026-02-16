-- Target normalization (organism, aliases), compound_target action flexibility, compound_card PK provenance (Plan Sections 3, 4, 6).
-- Run after 019.

-- =============================================================================
-- TARGET: organism and aliases
-- =============================================================================
ALTER TABLE target ADD COLUMN IF NOT EXISTS organism TEXT;
ALTER TABLE target ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_target_organism ON target(organism) WHERE organism IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_target_aliases ON target USING GIN(aliases);

-- Backfill organism from species where missing
UPDATE target SET organism = species WHERE organism IS NULL AND species IS NOT NULL;

-- =============================================================================
-- COMPOUND_TARGET: action as plain TEXT, optional action_detail
-- =============================================================================
ALTER TABLE compound_target DROP CONSTRAINT IF EXISTS compound_target_action_check;
ALTER TABLE compound_target ADD COLUMN IF NOT EXISTS action_detail TEXT;

-- =============================================================================
-- COMPOUND_CARD: PK provenance
-- =============================================================================
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS pharmacokinetics_source TEXT;
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS pk_extraction_method TEXT;
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS pk_confidence NUMERIC(3,2) CHECK (pk_confidence IS NULL OR (pk_confidence >= 0 AND pk_confidence <= 1));
