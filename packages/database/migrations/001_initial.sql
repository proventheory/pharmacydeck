-- PharmacyDeck initial schema. Canonical identity: RxCUI.
-- Run against Supabase (PostgreSQL).

-- Core entity per RxCUI
CREATE TABLE IF NOT EXISTS compound (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_rxcui ON compound(rxcui);

-- Terms that map to RxCUI (for search and display)
CREATE TABLE IF NOT EXISTS synonym (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui TEXT NOT NULL REFERENCES compound(rxcui) ON DELETE CASCADE,
  term TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_synonym_rxcui ON synonym(rxcui);
CREATE INDEX IF NOT EXISTS idx_synonym_term ON synonym(term);

-- RxCUI-to-RxCUI relations (e.g. has_tradename, contains)
CREATE TABLE IF NOT EXISTS relationship (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui_from TEXT NOT NULL REFERENCES compound(rxcui) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  rxcui_to TEXT NOT NULL REFERENCES compound(rxcui) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relationship_from ON relationship(rxcui_from);
CREATE INDEX IF NOT EXISTS idx_relationship_to ON relationship(rxcui_to);

-- Label text by section/source (DailyMed, openFDA)
CREATE TABLE IF NOT EXISTS label_snippet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui TEXT NOT NULL REFERENCES compound(rxcui) ON DELETE CASCADE,
  section TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_label_snippet_rxcui ON label_snippet(rxcui);

-- PubChem identity link
CREATE TABLE IF NOT EXISTS pubchem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui TEXT NOT NULL UNIQUE REFERENCES compound(rxcui) ON DELETE CASCADE,
  cid TEXT NOT NULL,
  formula TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pubchem_rxcui ON pubchem(rxcui);

-- Generated compound card / summary for UI
CREATE TABLE IF NOT EXISTS card (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui TEXT NOT NULL UNIQUE REFERENCES compound(rxcui) ON DELETE CASCADE,
  classification TEXT,
  mechanism_summary TEXT,
  uses_summary TEXT,
  safety_summary TEXT,
  source_links JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_rxcui ON card(rxcui);

-- Full-text search: compound names and synonyms (Phase 6)
ALTER TABLE compound ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(canonical_name, '') || ' ' || coalesce(description, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_compound_search ON compound USING GIN(search_vector);

-- Synonym search vector (optional; can search synonym.term via application)
-- For now application can use ILIKE or later add:
-- ALTER TABLE synonym ADD COLUMN IF NOT EXISTS search_vector tsvector ...
