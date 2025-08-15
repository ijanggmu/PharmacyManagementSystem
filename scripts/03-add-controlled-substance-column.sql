-- Add controlled_substance column to medicines table
ALTER TABLE medicines 
ADD COLUMN controlled_substance boolean DEFAULT false;

-- Update existing medicines to set controlled_substance based on prescription_required
UPDATE medicines 
SET controlled_substance = false 
WHERE prescription_required = false;

UPDATE medicines 
SET controlled_substance = true 
WHERE prescription_required = true AND (
  LOWER(name) LIKE '%morphine%' OR 
  LOWER(name) LIKE '%oxycodone%' OR 
  LOWER(name) LIKE '%codeine%' OR
  LOWER(generic_name) LIKE '%morphine%' OR 
  LOWER(generic_name) LIKE '%oxycodone%' OR 
  LOWER(generic_name) LIKE '%codeine%'
);
