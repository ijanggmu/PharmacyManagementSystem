-- Add is_taxable column to medicines table
ALTER TABLE medicines 
ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN DEFAULT true;

-- Update existing medicines to be taxable by default
UPDATE medicines SET is_taxable = true WHERE is_taxable IS NULL;

