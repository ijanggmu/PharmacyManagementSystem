-- Fix system_settings uniqueness: `key` was left globally UNIQUE (single-tenant era,
-- scripts/14-create-system-settings.sql) even after scripts/30-add-multi-tenancy.sql
-- made tenant_id mandatory and added an (tenant_id, key) index. The old global
-- constraint was never dropped, so only the very first tenant that ever inserted a
-- given key (e.g. 'tax_rate') can have it — every other tenant's save fails with
-- "duplicate key value violates unique constraint system_settings_key_key" the moment
-- they try to set a setting whose key already exists for any other tenant.

ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_key_key;

-- idx_system_settings_tenant_key (added in 30-add-multi-tenancy.sql) is a plain index,
-- not a uniqueness guarantee — add the real per-tenant unique constraint so upserts can
-- target it with ON CONFLICT (tenant_id, key).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_tenant_id_key_key'
  ) THEN
    ALTER TABLE system_settings ADD CONSTRAINT system_settings_tenant_id_key_key UNIQUE (tenant_id, key);
  END IF;
END $$;
