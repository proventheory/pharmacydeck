-- NDC product layer: products (dosage form, strength, manufacturer) per compound (Gap 5).
-- Run after 014_compound_identifier.

CREATE TABLE IF NOT EXISTS compound_product (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  ndc TEXT,
  product_ndc TEXT,
  dosage_form TEXT,
  strength TEXT,
  manufacturer TEXT,
  source TEXT DEFAULT 'openfda',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_product_compound_id ON compound_product(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_product_ndc ON compound_product(ndc) WHERE ndc IS NOT NULL;
