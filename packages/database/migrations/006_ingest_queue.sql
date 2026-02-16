-- Ingest queue for resumable bulk compound ingestion (e.g. top 10k).
-- Worker claims pending rows, upserts compound + compound_card (skeleton), marks done.
-- Run after 002_robust_schema and 003_card_schema_v1.

-- =============================================================================
-- INGEST_QUEUE (resumable; idempotent upserts keyed by rxcui)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ingest_queue (
  id BIGSERIAL PRIMARY KEY,
  rxcui TEXT NOT NULL UNIQUE,
  canonical_name TEXT,
  priority_score INTEGER,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_queue_status ON ingest_queue(status);
CREATE INDEX IF NOT EXISTS idx_ingest_queue_updated ON ingest_queue(updated_at);

-- =============================================================================
-- COMPOUND_CARD: ensure slug is unique for idempotent upserts
-- =============================================================================
-- Allow one card per slug (skeleton ingest uses slug from canonical_name).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'compound_card_slug_key' AND conrelid = 'compound_card'::regclass
  ) THEN
    CREATE UNIQUE INDEX compound_card_slug_key ON compound_card(slug) WHERE slug IS NOT NULL;
  END IF;
END $$;
