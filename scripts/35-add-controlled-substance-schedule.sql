-- Add controlled_substance_schedule column to medicines for compliance reports
ALTER TABLE medicines
ADD COLUMN IF NOT EXISTS controlled_substance_schedule VARCHAR(10);

