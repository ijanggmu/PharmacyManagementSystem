-- Add country setting to system_settings
DO $$
DECLARE
  v_tenant_id UUID;
  has_tenant BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='system_settings' AND column_name='tenant_id'
  ) INTO has_tenant;

  IF has_tenant THEN
    SELECT id INTO v_tenant_id FROM tenants WHERE code='default';
    IF v_tenant_id IS NULL THEN
      SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1;
    END IF;

    INSERT INTO system_settings (key, value, type, category, description, tenant_id)
    VALUES ('pharmacy_country', 'Nepal', 'string', 'general', 'Country where pharmacy is located', v_tenant_id)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO system_settings (key, value, type, category, description)
    VALUES ('pharmacy_country', 'Nepal', 'string', 'general', 'Country where pharmacy is located')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

