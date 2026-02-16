-- PharmacyTimes and other editorial/citation layer.
-- Store title, summary, link only (citation-safe). Run after 004.

CREATE TABLE IF NOT EXISTS compound_editorial_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL DEFAULT 'pharmacytimes',
  source_url TEXT,
  published_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_editorial_compound_id ON compound_editorial_reference(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_editorial_source ON compound_editorial_reference(source);
CREATE INDEX IF NOT EXISTS idx_compound_editorial_published ON compound_editorial_reference(published_date DESC NULLS LAST);
