-- Create medicine_batches table for batch tracking
CREATE TABLE IF NOT EXISTS medicine_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_number VARCHAR(100) UNIQUE NOT NULL,
  medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id),
  quantity INTEGER NOT NULL,
  expiry_date DATE NOT NULL,
  manufacturing_date DATE,
  supplier_id UUID REFERENCES suppliers(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  cost_price DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create batch_allocations table to track batch usage in sales
CREATE TABLE IF NOT EXISTS batch_allocations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID REFERENCES medicine_batches(id) ON DELETE CASCADE NOT NULL,
  sale_item_id UUID REFERENCES sale_items(id) ON DELETE CASCADE,
  prescription_item_id UUID REFERENCES prescription_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_medicine_batches_medicine_id ON medicine_batches(medicine_id);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_expiry_date ON medicine_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_batch_number ON medicine_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_batch_allocations_batch_id ON batch_allocations(batch_id);

-- Function to check for expiring batches
CREATE OR REPLACE FUNCTION get_expiring_batches(days_ahead INTEGER DEFAULT 30)
RETURNS TABLE (
  batch_id UUID,
  batch_number VARCHAR,
  medicine_name VARCHAR,
  expiry_date DATE,
  days_until_expiry INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mb.id,
    mb.batch_number,
    m.name,
    mb.expiry_date,
    EXTRACT(DAY FROM (mb.expiry_date - CURRENT_DATE))::INTEGER as days_until_expiry
  FROM medicine_batches mb
  JOIN medicines m ON mb.medicine_id = m.id
  WHERE mb.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (days_ahead || ' days')::INTERVAL
    AND mb.quantity > 0
  ORDER BY mb.expiry_date ASC;
END;
$$ LANGUAGE plpgsql;

