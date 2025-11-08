-- Add country setting to system_settings
INSERT INTO system_settings (key, value, type, category, description) 
VALUES ('pharmacy_country', 'Nepal', 'string', 'general', 'Country where pharmacy is located')
ON CONFLICT (key) DO NOTHING;

