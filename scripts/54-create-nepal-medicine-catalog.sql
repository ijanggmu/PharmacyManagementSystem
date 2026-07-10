CREATE TABLE IF NOT EXISTS nepal_medicine_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  generic_name TEXT NOT NULL,
  form TEXT,
  strength TEXT,
  manufacturer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nepal_medicine_catalog_brand_name
  ON nepal_medicine_catalog (brand_name);

CREATE INDEX IF NOT EXISTS idx_nepal_medicine_catalog_generic_name
  ON nepal_medicine_catalog (generic_name);

INSERT INTO nepal_medicine_catalog (brand_name, generic_name, form, strength, manufacturer)
VALUES
  ('Flexon', 'Ibuprofen + Paracetamol', 'tablet', '400mg + 325mg', 'Aristo Pharma'),
  ('Napa', 'Paracetamol', 'tablet', '500mg', 'Beximco'),
  ('Azithral', 'Azithromycin', 'tablet', '500mg', 'Alembic'),
  ('Aciloc', 'Ranitidine', 'tablet', '150mg', 'Cadila'),
  ('Metformin', 'Metformin Hydrochloride', 'tablet', '500mg', 'Lomus'),
  ('Amlod', 'Amlodipine', 'tablet', '5mg', 'Sun Pharma'),
  ('Losar', 'Losartan Potassium', 'tablet', '50mg', 'Torrent'),
  ('Cetzine', 'Cetirizine', 'tablet', '10mg', 'GlaxoSmithKline'),
  ('Pantocid', 'Pantoprazole', 'tablet', '40mg', 'Sun Pharma'),
  ('Montair', 'Montelukast', 'tablet', '10mg', 'Cipla')
ON CONFLICT DO NOTHING;
