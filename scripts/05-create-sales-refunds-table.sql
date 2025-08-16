-- Create sales refunds table for tracking refunded sales and items
CREATE TABLE IF NOT EXISTS sales_refunds (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    refund_number VARCHAR(50) UNIQUE NOT NULL,
    original_sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    refund_type VARCHAR(50) NOT NULL DEFAULT 'full_refund',
    refund_reason VARCHAR(100) NOT NULL,
    refund_amount DECIMAL(10,2) NOT NULL CHECK (refund_amount >= 0),
    tax_refund_amount DECIMAL(10,2) DEFAULT 0,
    processing_fee DECIMAL(10,2) DEFAULT 0,
    net_refund_amount DECIMAL(10,2) NOT NULL,
    refund_method VARCHAR(50) NOT NULL DEFAULT 'original_payment',
    refund_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
    processed_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create refund items table for tracking individual refunded items
CREATE TABLE IF NOT EXISTS sales_refund_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    refund_id UUID REFERENCES sales_refunds(id) ON DELETE CASCADE,
    sale_item_id UUID REFERENCES sale_items(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    quantity_refunded INTEGER NOT NULL CHECK (quantity_refunded > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_refund_amount DECIMAL(10,2) NOT NULL,
    condition_returned VARCHAR(50) DEFAULT 'good',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sales_refunds_original_sale_id ON sales_refunds(original_sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_refunds_customer_id ON sales_refunds(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_refunds_refund_date ON sales_refunds(refund_date);
CREATE INDEX IF NOT EXISTS idx_sales_refunds_status ON sales_refunds(refund_status);
CREATE INDEX IF NOT EXISTS idx_sales_refund_items_refund_id ON sales_refund_items(refund_id);
CREATE INDEX IF NOT EXISTS idx_sales_refund_items_medicine_id ON sales_refund_items(medicine_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sales_refunds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sales_refunds_updated_at
    BEFORE UPDATE ON sales_refunds
    FOR EACH ROW
    EXECUTE FUNCTION update_sales_refunds_updated_at();

-- Insert some sample refunds for testing
INSERT INTO sales_refunds (refund_number, original_sale_id, refund_reason, refund_amount, net_refund_amount, refund_method, notes)
SELECT 
    'REF-' || LPAD((ROW_NUMBER() OVER())::TEXT, 6, '0'),
    s.id,
    CASE 
        WHEN RANDOM() < 0.3 THEN 'defective_product'
        WHEN RANDOM() < 0.6 THEN 'customer_dissatisfaction'
        ELSE 'wrong_medication'
    END,
    ROUND((s.total_amount::NUMERIC * (0.3 + RANDOM() * 0.7))::NUMERIC, 2),
    ROUND((s.total_amount::NUMERIC * (0.3 + RANDOM() * 0.7) * 0.95)::NUMERIC, 2),
    CASE 
        WHEN s.payment_method = 'cash' THEN 'cash'
        ELSE 'original_payment'
    END,
    'Sample refund for testing purposes'
FROM sales s 
WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days'
LIMIT 3;
