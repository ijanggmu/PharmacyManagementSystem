-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT,
  type VARCHAR(50) NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
  category VARCHAR(100),
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

-- Insert default settings
INSERT INTO system_settings (key, value, type, category, description) VALUES
  ('pharmacy_name', 'Pharmacy Management System', 'string', 'general', 'Name of the pharmacy'),
  ('pharmacy_address', '', 'string', 'general', 'Pharmacy address'),
  ('pharmacy_phone', '', 'string', 'general', 'Pharmacy phone number'),
  ('pharmacy_email', '', 'string', 'general', 'Pharmacy email'),
  ('tax_rate', '0.1', 'number', 'sales', 'Default tax rate (10%)'),
  ('currency', 'USD', 'string', 'general', 'Default currency'),
  ('low_stock_threshold', '0.2', 'number', 'inventory', 'Low stock threshold (20% of minimum)'),
  ('expiry_warning_days', '30', 'number', 'inventory', 'Days before expiry to show warning'),
  ('enable_barcode', 'true', 'boolean', 'inventory', 'Enable barcode scanning'),
  ('enable_notifications', 'true', 'boolean', 'general', 'Enable system notifications')
ON CONFLICT (key) DO NOTHING;

-- Function to get setting value
CREATE OR REPLACE FUNCTION get_setting(p_key VARCHAR)
RETURNS TEXT AS $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT value INTO v_value
  FROM system_settings
  WHERE key = p_key;
  
  RETURN v_value;
END;
$$ LANGUAGE plpgsql;

-- Function to set setting value
CREATE OR REPLACE FUNCTION set_setting(p_key VARCHAR, p_value TEXT, p_type VARCHAR DEFAULT 'string')
RETURNS VOID AS $$
BEGIN
  INSERT INTO system_settings (key, value, type)
  VALUES (p_key, p_value, p_type)
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      type = EXCLUDED.type,
      updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

