-- IRD-compliant invoice fields and DDA narcotic register support

-- 1) Extend sales with invoice and IRD tracking fields
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS ird_invoice_id VARCHAR(150),
ADD COLUMN IF NOT EXISTS ird_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ird_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ird_error TEXT,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_ird_status ON sales(ird_status);

-- 1b) Enforce locking rules: once a sale is IRD-synced and locked,
-- disallow direct updates or deletes. Adjustments must go via refunds/credit notes.
DO $$
BEGIN
  -- Guard to avoid duplicate trigger creation
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_sales_prevent_locked_modifications'
  ) THEN
    CREATE OR REPLACE FUNCTION prevent_locked_sales_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.locked_at IS NOT NULL OR OLD.ird_status = 'synced' THEN
        RAISE EXCEPTION 'Cannot modify IRD-locked sale %. Use returns/credit notes instead.', OLD.id;
      END IF;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_sales_prevent_locked_modifications
    BEFORE UPDATE OR DELETE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION prevent_locked_sales_modification();
  END IF;
END $$;

-- 2) Queue table for IRD CBMS integration
CREATE TABLE IF NOT EXISTS ird_invoice_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, failed
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ird_invoice_queue_status ON ird_invoice_queue(status);
CREATE INDEX IF NOT EXISTS idx_ird_invoice_queue_tenant ON ird_invoice_queue(tenant_id);

-- 3) DDA-style narcotic register view
-- This view surfaces controlled-substance sales with prescription and doctor details.

CREATE OR REPLACE VIEW dda_narcotic_register AS
SELECT
  t.id AS tenant_id,
  s.id AS sale_id,
  s.sale_number,
  s.invoice_number,
  s.sale_date,
  c.id AS customer_id,
  c.first_name,
  c.last_name,
  c.date_of_birth,
  pr.id AS prescription_id,
  pr.prescription_number,
  pr.doctor_name,
  pr.doctor_license,
  si.id AS sale_item_id,
  m.id AS medicine_id,
  m.name AS medicine_name,
  m.generic_name,
  m.strength,
  m.form,
  m.controlled_substance,
  si.quantity,
  si.unit_price,
  (si.total_price) AS line_total
FROM sales s
JOIN tenants t ON s.tenant_id = t.id
JOIN sale_items si ON si.sale_id = s.id
JOIN medicines m ON m.id = si.medicine_id
LEFT JOIN customers c ON c.id = s.customer_id
LEFT JOIN prescriptions pr ON pr.id = s.prescription_id
WHERE m.controlled_substance = TRUE;

