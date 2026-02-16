-- Optional package layer (Plan 10.2): package_ndc per product for Layer 3 NDC packages.
-- Run after 022.

CREATE TABLE IF NOT EXISTS compound_package (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES compound_product(id) ON DELETE CASCADE,
  compound_id UUID NOT NULL REFERENCES compound(id) ON DELETE CASCADE,
  package_ndc TEXT NOT NULL,
  description TEXT,
  source TEXT DEFAULT 'openfda',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compound_package_compound_id ON compound_package(compound_id);
CREATE INDEX IF NOT EXISTS idx_compound_package_product_id ON compound_package(product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_compound_package_compound_package_ndc
  ON compound_package(compound_id, package_ndc);
