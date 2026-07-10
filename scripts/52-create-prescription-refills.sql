-- Prescription refills table (tenant-scoped)
CREATE TABLE IF NOT EXISTS prescription_refills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  refill_number INTEGER NOT NULL,
  quantity_dispensed INTEGER NOT NULL,
  refill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_refill_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'filled' CHECK (status IN ('pending', 'filled', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescription_refills_tenant_prescription_date
  ON prescription_refills(tenant_id, prescription_id, refill_date);

DO $$
BEGIN
  -- Enable RLS if not already
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'prescription_refills') THEN
    ALTER TABLE prescription_refills ENABLE ROW LEVEL SECURITY;
  END IF;

  -- Tenant policy (matches other tenant policies)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='prescription_refills' AND policyname='Prescription refills by tenant'
  ) THEN
    CREATE POLICY "Prescription refills by tenant" ON prescription_refills
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

