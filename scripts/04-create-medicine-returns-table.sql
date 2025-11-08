-- Create supplier returns table for tracking returned medicines to suppliers
-- Note: This is for returns TO suppliers, not FROM customers
CREATE TABLE IF NOT EXISTS supplier_returns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    return_number VARCHAR(50) UNIQUE NOT NULL,
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    quantity_returned INTEGER NOT NULL CHECK (quantity_returned > 0),
    return_reason VARCHAR(100) NOT NULL,
    return_type VARCHAR(50) NOT NULL DEFAULT 'supplier_return',
    batch_number VARCHAR(100),
    expiry_date DATE,
    unit_cost DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    notes TEXT,
    refund_amount DECIMAL(10,2) DEFAULT 0,
    refund_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_supplier_returns_medicine_id ON supplier_returns(medicine_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier_id ON supplier_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_return_date ON supplier_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_status ON supplier_returns(status);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_medicine_returns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_supplier_returns_updated_at
    BEFORE UPDATE ON supplier_returns
    FOR EACH ROW
    EXECUTE FUNCTION update_medicine_returns_updated_at();

-- Insert some sample return reasons (only if table is empty)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM supplier_returns LIMIT 1) THEN
        INSERT INTO supplier_returns (return_number, medicine_id, supplier_id, quantity_returned, return_reason, batch_number, notes)
        SELECT 
            'RET-' || LPAD((ROW_NUMBER() OVER())::TEXT, 6, '0'),
            m.id,
            m.supplier_id,
            CASE WHEN m.expiry_date < CURRENT_DATE THEN LEAST(m.stock_quantity, 10) ELSE 5 END,
            CASE 
                WHEN m.expiry_date < CURRENT_DATE THEN 'expired'
                ELSE 'defective'
            END,
            m.batch_number,
            CASE 
                WHEN m.expiry_date < CURRENT_DATE THEN 'Medicine expired, returning to supplier'
                ELSE 'Defective batch, quality issues reported'
            END
        FROM medicines m 
        WHERE m.supplier_id IS NOT NULL 
        LIMIT 5;
    END IF;
END $$;
