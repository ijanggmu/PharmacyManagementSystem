-- Seed data (supports both legacy and multi-tenant schemas).
DO $$
DECLARE
  v_tenant_id UUID;
  has_categories_tenant BOOLEAN;
  has_suppliers_tenant BOOLEAN;
  has_medicines_tenant BOOLEAN;
BEGIN
  -- Ensure we have a tenant to attach seed data to when tenant_id exists.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants') THEN
    INSERT INTO tenants (name, code, legal_name, license_number)
    VALUES ('Default Pharmacy', 'default', 'Default Pharmacy', NULL)
    ON CONFLICT (code) DO NOTHING;

    SELECT id INTO v_tenant_id FROM tenants WHERE code='default';
    IF v_tenant_id IS NULL THEN
      SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='categories' AND column_name='tenant_id'
  ) INTO has_categories_tenant;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='suppliers' AND column_name='tenant_id'
  ) INTO has_suppliers_tenant;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='medicines' AND column_name='tenant_id'
  ) INTO has_medicines_tenant;

  -- Insert default categories
  IF has_categories_tenant AND v_tenant_id IS NOT NULL THEN
    INSERT INTO categories (name, description, tenant_id) VALUES
    ('Antibiotics', 'Medicines that fight bacterial infections', v_tenant_id),
    ('Pain Relief', 'Analgesics and anti-inflammatory drugs', v_tenant_id),
    ('Cardiovascular', 'Heart and blood pressure medications', v_tenant_id),
    ('Diabetes', 'Blood sugar management medications', v_tenant_id),
    ('Respiratory', 'Asthma, cough, and breathing medications', v_tenant_id),
    ('Vitamins & Supplements', 'Nutritional supplements and vitamins', v_tenant_id),
    ('Skin Care', 'Topical treatments and dermatological products', v_tenant_id),
    ('Digestive', 'Stomach, intestinal, and digestive health', v_tenant_id),
    ('Mental Health', 'Antidepressants and anxiety medications', v_tenant_id),
    ('Over-the-Counter', 'Non-prescription medications', v_tenant_id)
    ON CONFLICT DO NOTHING;
  ELSE
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
  END IF;

  -- Insert sample suppliers
  IF has_suppliers_tenant AND v_tenant_id IS NOT NULL THEN
    INSERT INTO suppliers (name, contact_person, email, phone, address, tenant_id) VALUES
    ('MediSupply Corp', 'John Smith', 'orders@medisupply.com', '+1-555-0123', '123 Medical District, Healthcare City, HC 12345', v_tenant_id),
    ('PharmaCorp Ltd', 'Sarah Johnson', 'sales@pharmacorp.com', '+1-555-0456', '456 Pharma Avenue, Medicine Town, MT 67890', v_tenant_id),
    ('Global Health Distributors', 'Mike Wilson', 'info@globalhealthdist.com', '+1-555-0789', '789 Distribution Blvd, Supply City, SC 11111', v_tenant_id)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES
    ('MediSupply Corp', 'John Smith', 'orders@medisupply.com', '+1-555-0123', '123 Medical District, Healthcare City, HC 12345'),
    ('PharmaCorp Ltd', 'Sarah Johnson', 'sales@pharmacorp.com', '+1-555-0456', '456 Pharma Avenue, Medicine Town, MT 67890'),
    ('Global Health Distributors', 'Mike Wilson', 'info@globalhealthdist.com', '+1-555-0789', '789 Distribution Blvd, Supply City, SC 11111')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Insert sample medicines (using category and supplier IDs)
DO $$
DECLARE
  v_tenant_id UUID;
  has_medicines_tenant BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants') THEN
    SELECT id INTO v_tenant_id FROM tenants WHERE code='default';
    IF v_tenant_id IS NULL THEN
      SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='medicines' AND column_name='tenant_id'
  ) INTO has_medicines_tenant;

  IF has_medicines_tenant AND v_tenant_id IS NOT NULL THEN
    INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description, tenant_id)
    SELECT
      'Amoxicillin', 'Amoxicillin', 'Amoxil', c.id, s.id, '500mg', 'Capsule', '500mg', 12.50, 8.00, 100, 20, true, 'Antibiotic for bacterial infections', v_tenant_id
    FROM categories c, suppliers s
    WHERE c.name = 'Antibiotics' AND s.name = 'MediSupply Corp'
    ON CONFLICT DO NOTHING;

    INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description, tenant_id)
    SELECT
      'Ibuprofen', 'Ibuprofen', 'Advil', c.id, s.id, '200mg', 'Tablet', '200mg', 8.99, 5.50, 150, 30, false, 'Pain relief and anti-inflammatory', v_tenant_id
    FROM categories c, suppliers s
    WHERE c.name = 'Pain Relief' AND s.name = 'MediSupply Corp'
    ON CONFLICT DO NOTHING;

    INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description, tenant_id)
    SELECT
      'Lisinopril', 'Lisinopril', 'Prinivil', c.id, s.id, '10mg', 'Tablet', '10mg', 15.75, 10.00, 80, 15, true, 'ACE inhibitor for high blood pressure', v_tenant_id
    FROM categories c, suppliers s
    WHERE c.name = 'Cardiovascular' AND s.name = 'PharmaCorp Ltd'
    ON CONFLICT DO NOTHING;

    INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description, tenant_id)
    SELECT
      'Metformin', 'Metformin', 'Glucophage', c.id, s.id, '500mg', 'Tablet', '500mg', 18.25, 12.00, 120, 25, true, 'Type 2 diabetes medication', v_tenant_id
    FROM categories c, suppliers s
    WHERE c.name = 'Diabetes' AND s.name = 'PharmaCorp Ltd'
    ON CONFLICT DO NOTHING;

    INSERT INTO medicines (name, generic_name, brand_name, category_id, supplier_id, dosage, form, strength, unit_price, cost_price, stock_quantity, minimum_stock, prescription_required, description, tenant_id)
    SELECT
      'Vitamin D3', 'Cholecalciferol', 'Nature Made D3', c.id, s.id, '1000 IU', 'Softgel', '1000 IU', 22.99, 15.00, 200, 40, false, 'Vitamin D supplement for bone health', v_tenant_id
    FROM categories c, suppliers s
    WHERE c.name = 'Vitamins & Supplements' AND s.name = 'Global Health Distributors'
    ON CONFLICT DO NOTHING;
  ELSE
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
  END IF;
END $$;
