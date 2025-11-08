-- Handle migration: If medicine_returns exists with supplier structure, rename it to supplier_returns
DO $$
BEGIN
    -- Check if medicine_returns table exists and has supplier_id column (old structure)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'medicine_returns'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'medicine_returns' 
        AND column_name = 'supplier_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'medicine_returns' 
        AND column_name = 'sale_id'
    ) THEN
        -- Rename old supplier returns table
        ALTER TABLE medicine_returns RENAME TO supplier_returns;
        
        -- Rename indexes
        ALTER INDEX IF EXISTS idx_medicine_returns_medicine_id RENAME TO idx_supplier_returns_medicine_id;
        ALTER INDEX IF EXISTS idx_medicine_returns_supplier_id RENAME TO idx_supplier_returns_supplier_id;
        ALTER INDEX IF EXISTS idx_medicine_returns_return_date RENAME TO idx_supplier_returns_return_date;
        ALTER INDEX IF EXISTS idx_medicine_returns_status RENAME TO idx_supplier_returns_status;
        
        -- Rename trigger
        DROP TRIGGER IF EXISTS trigger_update_medicine_returns_updated_at ON supplier_returns;
        CREATE TRIGGER trigger_update_supplier_returns_updated_at
            BEFORE UPDATE ON supplier_returns
            FOR EACH ROW
            EXECUTE FUNCTION update_medicine_returns_updated_at();
    END IF;
END $$;

-- Create medicine_returns table for customer returns
CREATE TABLE IF NOT EXISTS medicine_returns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    return_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_return_amount DECIMAL(10,2) NOT NULL,
    return_reason TEXT NOT NULL,
    refund_method VARCHAR(50) DEFAULT 'original',
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create return_items table
CREATE TABLE IF NOT EXISTS return_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    return_id UUID REFERENCES medicine_returns(id) ON DELETE CASCADE,
    sale_item_id UUID REFERENCES sale_items(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    quantity_returned INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_medicine_returns_sale_id ON medicine_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_medicine_returns_customer_id ON medicine_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_medicine_returns_status ON medicine_returns(status);
CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_medicine_id ON return_items(medicine_id);

-- Add RLS policies
ALTER TABLE medicine_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;

-- Policies for medicine_returns
CREATE POLICY "Users can view their own returns" ON medicine_returns
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert returns" ON medicine_returns
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update returns" ON medicine_returns
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Policies for return_items
CREATE POLICY "Users can view return items" ON return_items
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert return items" ON return_items
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update return items" ON return_items
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for medicine_returns
CREATE TRIGGER update_medicine_returns_updated_at 
    BEFORE UPDATE ON medicine_returns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
