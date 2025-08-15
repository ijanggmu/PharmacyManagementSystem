-- Insert default categories
INSERT INTO categories (name, description) VALUES
('Antibiotics', 'Medicines that fight bacterial infections'),
('Pain Relief', 'Analgesics and anti-inflammatory drugs'),
('Cardiovascular', 'Heart and blood pressure medications'),
('Diabetes', 'Blood sugar management medications'),
('Respiratory', 'Asthma, cough, and breathing medications'),
('Vitamins & Supplements', 'Nutritional supplements and vitamins'),
('Skin Care', 'Topical treatments and dermatological products'),
('Digestive', 'Stomach, intestinal, and digestive health'),
('Mental Health', 'Antidepressants and anxiety medications'),
('Over-the-Counter', 'Non-prescription medications')
ON CONFLICT DO NOTHING;

-- Insert sample supplier
INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES
('MediSupply Corp', 'John Smith', 'orders@medisupply.com', '+1-555-0123', '123 Medical District, Healthcare City, HC 12345'),
('PharmaCorp Ltd', 'Sarah Johnson', 'sales@pharmacorp.com', '+1-555-0456', '456 Pharma Avenue, Medicine Town, MT 67890'),
('Global Health Distributors', 'Mike Wilson', 'info@globalhealthdist.com', '+1-555-0789', '789 Distribution Blvd, Supply City, SC 11111')
ON CONFLICT DO NOTHING;

-- Insert sample medicines (using category and supplier IDs)
INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description)
SELECT 
  'Amoxicillin', 'Amoxicillin', 'Amoxil', c.id, s.id, '500mg', 'Capsule', '500mg', 12.50, 8.00, 100, 20, true, 'Antibiotic for bacterial infections'
FROM categories c, suppliers s 
WHERE c.name = 'Antibiotics' AND s.name = 'MediSupply Corp'
ON CONFLICT DO NOTHING;

INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description)
SELECT 
  'Ibuprofen', 'Ibuprofen', 'Advil', c.id, s.id, '200mg', 'Tablet', '200mg', 8.99, 5.50, 150, 30, false, 'Pain relief and anti-inflammatory'
FROM categories c, suppliers s 
WHERE c.name = 'Pain Relief' AND s.name = 'MediSupply Corp'
ON CONFLICT DO NOTHING;

INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description)
SELECT 
  'Lisinopril', 'Lisinopril', 'Prinivil', c.id, s.id, '10mg', 'Tablet', '10mg', 15.75, 10.00, 80, 15, true, 'ACE inhibitor for high blood pressure'
FROM categories c, suppliers s 
WHERE c.name = 'Cardiovascular' AND s.name = 'PharmaCorp Ltd'
ON CONFLICT DO NOTHING;

INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description)
SELECT 
  'Metformin', 'Metformin', 'Glucophage', c.id, s.id, '500mg', 'Tablet', '500mg', 18.25, 12.00, 120, 25, true, 'Type 2 diabetes medication'
FROM categories c, suppliers s 
WHERE c.name = 'Diabetes' AND s.name = 'PharmaCorp Ltd'
ON CONFLICT DO NOTHING;

INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description)
SELECT 
  'Vitamin D3', 'Cholecalciferol', 'Nature Made D3', c.id, s.id, '1000 IU', 'Softgel', '1000 IU', 22.99, 15.00, 200, 40, false, 'Vitamin D supplement for bone health'
FROM categories c, suppliers s 
WHERE c.name = 'Vitamins & Supplements' AND s.name = 'Global Health Distributors'
ON CONFLICT DO NOTHING;
