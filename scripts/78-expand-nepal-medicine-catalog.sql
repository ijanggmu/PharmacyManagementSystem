-- Expand the Nepal medicine catalog with the fields needed to fully prefill
-- the "Add Medicine" form (pricing, category, description, side effects,
-- storage instructions) instead of only brand/generic/form/strength.

ALTER TABLE nepal_medicine_catalog ADD COLUMN IF NOT EXISTS category_name TEXT;
ALTER TABLE nepal_medicine_catalog ADD COLUMN IF NOT EXISTS dosage TEXT;
ALTER TABLE nepal_medicine_catalog ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10, 2);
ALTER TABLE nepal_medicine_catalog ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2);
ALTER TABLE nepal_medicine_catalog ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE nepal_medicine_catalog ADD COLUMN IF NOT EXISTS side_effects TEXT;
ALTER TABLE nepal_medicine_catalog ADD COLUMN IF NOT EXISTS storage_instructions TEXT;
ALTER TABLE nepal_medicine_catalog ADD COLUMN IF NOT EXISTS prescription_required BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_nepal_medicine_catalog_category_name
  ON nepal_medicine_catalog (category_name);

-- Backfill existing rows with category + pricing + clinical data.
UPDATE nepal_medicine_catalog SET
  category_name = 'Pain Relief', dosage = '1 tablet every 6-8 hours after food',
  unit_price = 3.50, cost_price = 2.20,
  description = 'Combination analgesic and antipyretic used for pain and fever relief.',
  side_effects = 'Nausea, stomach upset, dizziness',
  storage_instructions = 'Store below 30°C in a dry place, away from direct sunlight',
  prescription_required = FALSE
WHERE brand_name = 'Flexon';

UPDATE nepal_medicine_catalog SET
  category_name = 'Pain Relief', dosage = '1 tablet every 4-6 hours as needed',
  unit_price = 1.50, cost_price = 0.90,
  description = 'Paracetamol used to relieve mild to moderate pain and reduce fever.',
  side_effects = 'Rare at normal doses; liver damage in overdose',
  storage_instructions = 'Store below 25°C in a dry place, away from direct sunlight',
  prescription_required = FALSE
WHERE brand_name = 'Napa';

UPDATE nepal_medicine_catalog SET
  category_name = 'Antibiotics', dosage = '1 tablet once daily for 3 days',
  unit_price = 12.00, cost_price = 8.50,
  description = 'Macrolide antibiotic used to treat bacterial respiratory, ear, and skin infections.',
  side_effects = 'Diarrhea, nausea, abdominal pain',
  storage_instructions = 'Store below 30°C, protect from moisture',
  prescription_required = TRUE
WHERE brand_name = 'Azithral';

UPDATE nepal_medicine_catalog SET
  category_name = 'Digestive', dosage = '1 tablet twice daily before meals',
  unit_price = 2.80, cost_price = 1.60,
  description = 'H2-receptor antagonist that reduces stomach acid production for ulcers and reflux.',
  side_effects = 'Headache, constipation, diarrhea',
  storage_instructions = 'Store below 25°C, protect from light and moisture',
  prescription_required = FALSE
WHERE brand_name = 'Aciloc';

UPDATE nepal_medicine_catalog SET
  category_name = 'Diabetes', dosage = '1 tablet twice daily with meals',
  unit_price = 2.20, cost_price = 1.30,
  description = 'Oral biguanide used to control blood sugar levels in type 2 diabetes.',
  side_effects = 'Nausea, diarrhea, metallic taste',
  storage_instructions = 'Store below 25°C in a dry place',
  prescription_required = TRUE
WHERE brand_name = 'Metformin';

UPDATE nepal_medicine_catalog SET
  category_name = 'Cardiovascular', dosage = '1 tablet once daily',
  unit_price = 3.00, cost_price = 1.90,
  description = 'Calcium channel blocker used to treat high blood pressure and angina.',
  side_effects = 'Swelling of ankles, dizziness, flushing',
  storage_instructions = 'Store below 30°C, protect from light',
  prescription_required = TRUE
WHERE brand_name = 'Amlod';

UPDATE nepal_medicine_catalog SET
  category_name = 'Cardiovascular', dosage = '1 tablet once daily',
  unit_price = 4.50, cost_price = 2.80,
  description = 'Angiotensin receptor blocker used to treat high blood pressure and protect kidney function.',
  side_effects = 'Dizziness, fatigue, high potassium levels',
  storage_instructions = 'Store below 30°C in a dry place',
  prescription_required = TRUE
WHERE brand_name = 'Losar';

UPDATE nepal_medicine_catalog SET
  category_name = 'Respiratory', dosage = '1 tablet once daily as needed',
  unit_price = 1.80, cost_price = 1.00,
  description = 'Antihistamine used to relieve allergy symptoms such as sneezing, itching, and runny nose.',
  side_effects = 'Drowsiness, dry mouth, fatigue',
  storage_instructions = 'Store below 30°C, away from moisture',
  prescription_required = FALSE
WHERE brand_name = 'Cetzine';

UPDATE nepal_medicine_catalog SET
  category_name = 'Digestive', dosage = '1 tablet once daily before breakfast',
  unit_price = 5.50, cost_price = 3.40,
  description = 'Proton pump inhibitor that reduces stomach acid for ulcers and acid reflux (GERD).',
  side_effects = 'Headache, diarrhea, abdominal pain',
  storage_instructions = 'Store below 30°C, protect from light and moisture',
  prescription_required = FALSE
WHERE brand_name = 'Pantocid';

UPDATE nepal_medicine_catalog SET
  category_name = 'Respiratory', dosage = '1 tablet once daily in the evening',
  unit_price = 15.00, cost_price = 10.20,
  description = 'Leukotriene receptor antagonist used to prevent asthma symptoms and treat seasonal allergies.',
  side_effects = 'Headache, stomach pain, mood changes',
  storage_instructions = 'Store below 25°C, protect from light and moisture',
  prescription_required = TRUE
WHERE brand_name = 'Montair';

-- Additional catalog entries covering more categories seeded in
-- scripts/02-seed-initial-data.sql (Vitamins & Supplements, Skin Care,
-- Mental Health, Over-the-Counter) plus more common antibiotics/OTC items.
INSERT INTO nepal_medicine_catalog
  (brand_name, generic_name, form, strength, manufacturer, category_name, dosage, unit_price, cost_price, description, side_effects, storage_instructions, prescription_required)
VALUES
  ('Amoxil', 'Amoxicillin', 'capsule', '500mg', 'GSK Nepal', 'Antibiotics', '1 capsule three times daily for 5-7 days', 8.00, 5.20, 'Penicillin-type antibiotic used to treat a wide range of bacterial infections.', 'Diarrhea, rash, nausea', 'Store below 25°C in a dry place', TRUE),
  ('Ciplox', 'Ciprofloxacin', 'tablet', '500mg', 'Cipla', 'Antibiotics', '1 tablet twice daily for 5-7 days', 6.50, 4.10, 'Fluoroquinolone antibiotic used for urinary, respiratory, and gastrointestinal infections.', 'Nausea, headache, tendon pain', 'Store below 30°C, protect from light', TRUE),
  ('Becosules', 'Vitamin B-Complex + Vitamin C', 'capsule', 'Standard', 'Pfizer Nepal', 'Vitamins & Supplements', '1 capsule once daily after food', 2.00, 1.20, 'Multivitamin supplement to correct vitamin B and C deficiencies and support energy metabolism.', 'Mild stomach upset', 'Store below 25°C in a dry place', FALSE),
  ('Shelcal', 'Calcium Carbonate + Vitamin D3', 'tablet', '500mg', 'Torrent', 'Vitamins & Supplements', '1 tablet once or twice daily after food', 3.20, 2.00, 'Calcium and vitamin D3 supplement for bone health and osteoporosis prevention.', 'Constipation, bloating', 'Store below 30°C in a dry place', FALSE),
  ('Candid', 'Clotrimazole', 'cream', '1%', 'Glenmark', 'Skin Care', 'Apply thin layer to affected area twice daily', 4.00, 2.50, 'Antifungal cream used to treat fungal skin infections such as ringworm and athlete''s foot.', 'Local irritation, redness', 'Store below 30°C, do not freeze', FALSE),
  ('Betnovate', 'Betamethasone', 'cream', '0.1%', 'GSK Nepal', 'Skin Care', 'Apply thin layer to affected area once or twice daily', 5.00, 3.10, 'Topical corticosteroid used to reduce inflammation, itching, and redness in skin conditions.', 'Skin thinning with prolonged use, burning sensation', 'Store below 25°C, protect from light', TRUE),
  ('Sertraline', 'Sertraline Hydrochloride', 'tablet', '50mg', 'Sun Pharma', 'Mental Health', '1 tablet once daily', 6.00, 3.90, 'SSRI antidepressant used to treat depression, anxiety, and panic disorders.', 'Nausea, insomnia, dry mouth', 'Store below 30°C in a dry place', TRUE),
  ('Alprax', 'Alprazolam', 'tablet', '0.25mg', 'Torrent', 'Mental Health', '1 tablet as directed by physician', 3.50, 2.10, 'Benzodiazepine used short-term for the management of anxiety disorders.', 'Drowsiness, dizziness, dependence with prolonged use', 'Store below 25°C, keep away from children', TRUE),
  ('ORS', 'Oral Rehydration Salts', 'sachet', 'Standard', 'WHO Formula', 'Over-the-Counter', 'Dissolve 1 sachet in 1 liter of clean water, drink as needed', 0.80, 0.40, 'Electrolyte solution used to prevent and treat dehydration from diarrhea or vomiting.', 'Rare; mild nausea if concentration is too strong', 'Store below 30°C in a dry place', FALSE),
  ('Digene', 'Magnesium Hydroxide + Aluminium Hydroxide', 'tablet', 'Standard', 'Abbott', 'Over-the-Counter', '1-2 tablets after meals and at bedtime', 2.50, 1.50, 'Antacid used to relieve heartburn, acidity, and indigestion.', 'Mild diarrhea or constipation', 'Store below 30°C in a dry place', FALSE)
ON CONFLICT DO NOTHING;
