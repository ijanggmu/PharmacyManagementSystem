-- Create warehouses table for multi-location support
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create warehouse_stock table to track inventory by location
CREATE TABLE IF NOT EXISTS warehouse_stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE NOT NULL,
  medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(warehouse_id, medicine_id)
);

-- Create stock_transfers table
CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_number VARCHAR(100) UNIQUE NOT NULL,
  from_warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  to_warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  medicine_id UUID REFERENCES medicines(id) NOT NULL,
  quantity INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'in_transit', 'completed', 'cancelled')) DEFAULT 'pending',
  transfer_date DATE NOT NULL,
  received_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse_id ON warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_medicine_id ON warehouse_stock(medicine_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_warehouse ON stock_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_warehouse ON stock_transfers(to_warehouse_id);

-- Ensure only one default warehouse
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_default ON warehouses(is_default) WHERE is_default = true;

