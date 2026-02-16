-- PharmacyDeck robust schema (canonical identity: compound.id; RxCUI on compound).
-- Run in Supabase SQL Editor. This REPLACES the previous schema (drops old tables).
-- Backup data first if you need to preserve it.

-- =============================================================================
-- DROP OLD TABLES (reverse dependency order)
-- =============================================================================
DROP TABLE IF EXISTS card CASCADE;
DROP TABLE IF EXISTS pubchem CASCADE;
DROP TABLE IF EXISTS label_snippet CASCADE;
DROP TABLE IF EXISTS relationship CASCADE;
DROP TABLE IF EXISTS synonym CASCADE;
DROP TABLE IF EXISTS compound CASCADE;

-- =============================================================================
-- 1. COMPOUND (canonical identity layer)
-- =============================================================================
CREATE TABLE compound (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'obsolete')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compound_rxcui ON compound(rxcui);
CREATE INDEX idx_compound_normalized_name ON compound(normalized_name);
CREATE INDEX idx_compound_status ON compound(status);

-- =============================================================================
-- 2. COMPOUND_SYNONYM (relational, not JSON)
-- =============================================================================
CREATE TABLE compound_synonym (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  synonym TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('rxnorm', 'pubchem', 'fda', 'dailymed', 'openfda')),
  is_preferred BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compound_synonym_compound_id ON compound_synonym(compound_id);
CREATE INDEX idx_compound_synonym_synonym ON compound_synonym(synonym);

-- =============================================================================
-- 3. COMPOUND_RELATION (graph navigation)
-- =============================================================================
CREATE TABLE compound_relation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id_from UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  compound_id_to UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT compound_relation_no_self CHECK (compound_id_from != compound_id_to)
);

CREATE INDEX idx_compound_relation_from ON compound_relation(compound_id_from);
CREATE INDEX idx_compound_relation_to ON compound_relation(compound_id_to);

-- =============================================================================
-- 4. COMPOUND_PUBCHEM (chemical identity)
-- =============================================================================
CREATE TABLE compound_pubchem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL UNIQUE REFERENCES compound(id) ON DELETE CASCADE,
  pubchem_cid TEXT NOT NULL,
  molecular_formula TEXT,
  molecular_weight TEXT,
  smiles TEXT,
  inchi_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compound_pubchem_compound_id ON compound_pubchem(compound_id);

-- =============================================================================
-- 5. COMPOUND_LABEL_SNIPPET (append-only, versioned)
-- =============================================================================
CREATE TABLE compound_label_snippet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL CHECK (section_type IN (
    'indication', 'warning', 'contraindication', 'adverse_reaction', 'mechanism',
    'description', 'clinical_pharmacology', 'dosage_and_administration', 'drug_interactions', 'pregnancy', 'purpose'
  )),
  snippet_text TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  source_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compound_label_snippet_compound_id ON compound_label_snippet(compound_id);
CREATE INDEX idx_compound_label_snippet_section ON compound_label_snippet(compound_id, section_type);

-- =============================================================================
-- 6. COMPOUND_CARD (product layer, versioned)
-- =============================================================================
CREATE TABLE compound_card (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  mechanism_summary TEXT,
  uses_summary TEXT,
  safety_summary TEXT,
  classification TEXT,
  interactions_count INTEGER,
  rarity_score NUMERIC,
  power_score NUMERIC,
  vibe_tags JSONB DEFAULT '[]',
  source_links JSONB DEFAULT '[]',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compound_card_compound_id ON compound_card(compound_id);
CREATE UNIQUE INDEX idx_compound_card_compound_version ON compound_card(compound_id, version);

-- =============================================================================
-- 7. COMPOUND_SOURCE_REFERENCE (provenance)
-- =============================================================================
CREATE TABLE compound_source_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('rxnorm', 'pubchem', 'dailymed', 'openfda')),
  source_url TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compound_source_ref_compound_id ON compound_source_reference(compound_id);
CREATE UNIQUE INDEX idx_compound_source_ref_compound_source ON compound_source_reference(compound_id, source_type);

-- =============================================================================
-- 8. COMPOUND_SEARCH_INDEX (full-text)
-- =============================================================================
CREATE TABLE compound_search_index (
  compound_id UUID PRIMARY KEY REFERENCES compound(id) ON DELETE CASCADE,
  search_vector tsvector NOT NULL
);

CREATE INDEX idx_compound_search_vector ON compound_search_index USING GIN(search_vector);

-- Trigger: keep compound_search_index in sync (compound + synonyms)
CREATE OR REPLACE FUNCTION compound_search_index_upsert()
RETURNS TRIGGER AS $$
DECLARE
  cid UUID;
BEGIN
  IF TG_TABLE_NAME = 'compound' THEN
    cid := NEW.id;
  ELSIF TG_TABLE_NAME = 'compound_synonym' THEN
    cid := COALESCE(NEW.compound_id, OLD.compound_id);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF cid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  INSERT INTO compound_search_index (compound_id, search_vector)
  SELECT c.id, (
    setweight(to_tsvector('english', coalesce(c.canonical_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(c.normalized_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(string_agg(cs.synonym, ' '), '')), 'B')
  )
  FROM compound c
  LEFT JOIN compound_synonym cs ON cs.compound_id = c.id
  WHERE c.id = cid
  GROUP BY c.id, c.canonical_name, c.normalized_name
  ON CONFLICT (compound_id) DO UPDATE SET
    search_vector = EXCLUDED.search_vector;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compound_search_index_after_compound
  AFTER INSERT OR UPDATE ON compound
  FOR EACH ROW EXECUTE PROCEDURE compound_search_index_upsert();

CREATE TRIGGER compound_search_index_after_synonym
  AFTER INSERT OR UPDATE OR DELETE ON compound_synonym
  FOR EACH ROW EXECUTE PROCEDURE compound_search_index_upsert();

-- =============================================================================
-- 9. DATA_PACK (offline pack versions)
-- =============================================================================
CREATE TABLE data_pack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  download_url TEXT
);

CREATE INDEX idx_data_pack_version ON data_pack(version);

-- =============================================================================
-- 10. DATA_PACK_COMPOUND (which compounds in each pack)
-- =============================================================================
CREATE TABLE data_pack_compound (
  pack_id UUID NOT NULL REFERENCES data_pack(id) ON DELETE CASCADE,
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (pack_id, compound_id)
);

CREATE INDEX idx_data_pack_compound_pack ON data_pack_compound(pack_id);
CREATE INDEX idx_data_pack_compound_compound ON data_pack_compound(compound_id);

-- =============================================================================
-- 11. USER_DECK (future: user decks)
-- =============================================================================
CREATE TABLE user_deck (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_deck_user_id ON user_deck(user_id);

-- =============================================================================
-- 12. USER_DECK_ITEM
-- =============================================================================
CREATE TABLE user_deck_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES user_deck(id) ON DELETE CASCADE,
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(deck_id, compound_id)
);

CREATE INDEX idx_user_deck_item_deck ON user_deck_item(deck_id);
CREATE INDEX idx_user_deck_item_compound ON user_deck_item(compound_id);

-- =============================================================================
-- 13. COMPOUND_AI_CACHE
-- =============================================================================
CREATE TABLE compound_ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  query_hash TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(compound_id, query_hash)
);

CREATE INDEX idx_compound_ai_cache_compound ON compound_ai_cache(compound_id);
