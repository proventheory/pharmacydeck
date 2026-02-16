-- Job orchestration: per-entity jobs with status, attempts, dead-letter (Plan Section 9).
-- Run after 020.

-- Allow dead_letter on ingest_queue so workers stop retrying after N failures
DO $$
BEGIN
  ALTER TABLE ingest_queue DROP CONSTRAINT IF EXISTS ingest_queue_status_check;
  ALTER TABLE ingest_queue ADD CONSTRAINT ingest_queue_status_check
    CHECK (status IN ('pending', 'processing', 'done', 'error', 'dead_letter'));
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ingest_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  compound_id UUID REFERENCES compound(id) ON DELETE SET NULL,
  rxcui TEXT,
  entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed', 'dead_letter')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_job_status ON ingest_job(status);
CREATE INDEX IF NOT EXISTS idx_ingest_job_compound_id ON ingest_job(compound_id) WHERE compound_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingest_job_rxcui ON ingest_job(rxcui) WHERE rxcui IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingest_job_created ON ingest_job(created_at);
