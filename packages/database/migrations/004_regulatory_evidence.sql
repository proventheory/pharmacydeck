-- PharmacyDeck Regulatory + Evidence layer (FDA, PubMed, guidelines).
-- Run after 003_card_schema_v1. Adds compound_regulatory, FDA label sections,
-- compound_study, compound_study_finding, compound_guideline_reference;
-- extends compound_card with regulatory/evidence summary fields.

-- =============================================================================
-- REGULATORY (FDA)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compound_regulatory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  approval_date DATE,
  approval_type TEXT,
  approval_status TEXT CHECK (approval_status IS NULL OR approval_status IN ('approved', 'withdrawn', 'investigational')),
  fda_application_number TEXT,
  fda_label_url TEXT,
  boxed_warning BOOLEAN DEFAULT false,
  rems_required BOOLEAN DEFAULT false,
  controlled_substance_schedule TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_regulatory_compound_id ON compound_regulatory(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_regulatory_status ON compound_regulatory(approval_status) WHERE approval_status IS NOT NULL;

-- =============================================================================
-- FDA LABEL SECTIONS (structured regulatory sections, separate from snippets)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compound_fda_label_section (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  version_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_fda_label_section_compound ON compound_fda_label_section(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_fda_label_section_name ON compound_fda_label_section(compound_id, section);

-- =============================================================================
-- PUBMED STUDIES (evidence layer)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compound_study (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  pubmed_id TEXT NOT NULL,
  title TEXT,
  journal TEXT,
  publication_date DATE,
  study_type TEXT,
  population_size INTEGER,
  summary TEXT,
  doi TEXT,
  pubmed_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(compound_id, pubmed_id)
);

CREATE INDEX IF NOT EXISTS idx_compound_study_compound_id ON compound_study(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_study_pubmed_id ON compound_study(pubmed_id);
CREATE INDEX IF NOT EXISTS idx_compound_study_date ON compound_study(publication_date DESC);

-- =============================================================================
-- STUDY FINDINGS (structured findings per study)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compound_study_finding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES compound_study(id) ON DELETE CASCADE,
  finding_type TEXT,
  finding_summary TEXT NOT NULL,
  confidence_level TEXT CHECK (confidence_level IS NULL OR confidence_level IN ('high', 'moderate', 'low')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_study_finding_study ON compound_study_finding(study_id);

-- =============================================================================
-- GUIDELINE REFERENCES (ADA, AHA, Endocrine Society, etc.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compound_guideline_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,
  recommendation TEXT,
  source_url TEXT,
  recommendation_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_guideline_compound_id ON compound_guideline_reference(compound_id);

-- =============================================================================
-- COMPOUND_CARD: regulatory + evidence summary fields (presentation)
-- =============================================================================
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS regulatory_summary TEXT;
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS evidence_summary TEXT;
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS study_count INTEGER;
ALTER TABLE compound_card ADD COLUMN IF NOT EXISTS guideline_count INTEGER;

-- =============================================================================
-- RLS (public read for evidence/regulatory)
-- =============================================================================
ALTER TABLE compound_regulatory ENABLE ROW LEVEL SECURITY;
ALTER TABLE compound_fda_label_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE compound_study ENABLE ROW LEVEL SECURITY;
ALTER TABLE compound_study_finding ENABLE ROW LEVEL SECURITY;
ALTER TABLE compound_guideline_reference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read compound_regulatory" ON compound_regulatory;
CREATE POLICY "Public read compound_regulatory" ON compound_regulatory FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read compound_fda_label_section" ON compound_fda_label_section;
CREATE POLICY "Public read compound_fda_label_section" ON compound_fda_label_section FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read compound_study" ON compound_study;
CREATE POLICY "Public read compound_study" ON compound_study FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read compound_study_finding" ON compound_study_finding;
CREATE POLICY "Public read compound_study_finding" ON compound_study_finding FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read compound_guideline_reference" ON compound_guideline_reference;
CREATE POLICY "Public read compound_guideline_reference" ON compound_guideline_reference FOR SELECT USING (true);
