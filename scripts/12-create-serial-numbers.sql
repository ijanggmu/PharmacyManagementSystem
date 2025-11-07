-- Create serial_numbers table for serialized inventory tracking
CREATE TABLE IF NOT EXISTS serial_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_number VARCHAR(255) UNIQUE NOT NULL,
  medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE NOT NULL,
  batch_id UUID REFERENCES medicine_batches(id),
  warehouse_id UUID REFERENCES warehouses(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('available', 'sold', 'returned', 'damaged', 'expired')) DEFAULT 'available',
  sale_item_id UUID REFERENCES sale_items(id),
  purchase_date DATE,
  expiry_date DATE,
  cost_price DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_serial_numbers_medicine_id ON serial_numbers(medicine_id);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_serial_number ON serial_numbers(serial_number);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_status ON serial_numbers(status);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_batch_id ON serial_numbers(batch_id);

-- Function to get available serial numbers for a medicine
CREATE OR REPLACE FUNCTION get_available_serial_numbers(p_medicine_id UUID)
RETURNS TABLE (
  serial_number VARCHAR,
  batch_number VARCHAR,
  expiry_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sn.serial_number,
    mb.batch_number,
    sn.expiry_date
  FROM serial_numbers sn
  LEFT JOIN medicine_batches mb ON sn.batch_id = mb.id
  WHERE sn.medicine_id = p_medicine_id
    AND sn.status = 'available'
    AND (sn.expiry_date IS NULL OR sn.expiry_date > CURRENT_DATE)
  ORDER BY sn.expiry_date ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

