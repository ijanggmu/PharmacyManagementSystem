-- Create migrations tracking table
-- This should be run FIRST before any other migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_name VARCHAR(255) UNIQUE NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_by VARCHAR(255),
  checksum VARCHAR(64),
  notes TEXT
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_schema_migrations_name ON schema_migrations(migration_name);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);

-- Function to check if a migration has been applied
CREATE OR REPLACE FUNCTION migration_applied(migration_name_param VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM schema_migrations 
    WHERE migration_name = migration_name_param
  );
END;
$$ LANGUAGE plpgsql;

-- Function to record a migration
CREATE OR REPLACE FUNCTION record_migration(
  migration_name_param VARCHAR,
  executed_by_param VARCHAR DEFAULT NULL,
  checksum_param VARCHAR DEFAULT NULL,
  notes_param TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO schema_migrations (migration_name, executed_by, checksum, notes)
  VALUES (migration_name_param, executed_by_param, checksum_param, notes_param)
  ON CONFLICT (migration_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

