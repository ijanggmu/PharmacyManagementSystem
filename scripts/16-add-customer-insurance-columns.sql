-- Add insurance_provider and insurance_number columns to customers table
-- These columns were being used in the code but were missing from the schema

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS insurance_provider VARCHAR(255),
ADD COLUMN IF NOT EXISTS insurance_number VARCHAR(255),
ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(255);

-- If insurance_info JSONB exists and has data, migrate it to the new columns
-- This is optional and only runs if insurance_info has provider/number fields
DO $$
DECLARE
    customer_record RECORD;
BEGIN
    -- Only migrate if insurance_info column exists and has data
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'customers' 
        AND column_name = 'insurance_info'
    ) THEN
        FOR customer_record IN 
            SELECT id, insurance_info 
            FROM customers 
            WHERE insurance_info IS NOT NULL
        LOOP
            -- Try to extract provider and number from JSONB if they exist
            IF customer_record.insurance_info ? 'provider' THEN
                UPDATE customers 
                SET insurance_provider = customer_record.insurance_info->>'provider'
                WHERE id = customer_record.id 
                AND insurance_provider IS NULL;
            END IF;
            
            IF customer_record.insurance_info ? 'number' THEN
                UPDATE customers 
                SET insurance_number = customer_record.insurance_info->>'number'
                WHERE id = customer_record.id 
                AND insurance_number IS NULL;
            END IF;
        END LOOP;
    END IF;
END $$;

