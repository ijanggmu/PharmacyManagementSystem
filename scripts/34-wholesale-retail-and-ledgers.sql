-- Wholesale vs retail handling and supplier ledger foundations

-- 1) Extend medicines and sales for wholesale/retail flows
ALTER TABLE medicines
ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS sale_unit VARCHAR(50);

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) DEFAULT 'retail' CHECK (sale_type IN ('retail', 'wholesale'));

CREATE INDEX IF NOT EXISTS idx_sales_sale_type ON sales(sale_type);

-- 2) Supplier ledger entries to track payables
CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id UUID,
  reference_number VARCHAR(100),
  entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN ('invoice', 'payment', 'credit_note', 'adjustment')),
  description TEXT,
  amount NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_tenant_supplier ON supplier_ledger_entries(tenant_id, supplier_id, entry_date);

-- 3) Goods receipts (GRN) table to link PO to received stock
CREATE TABLE IF NOT EXISTS goods_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  receipt_number VARCHAR(100) UNIQUE NOT NULL,
  receipt_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'received', 'cancelled')) DEFAULT 'received',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id),
  quantity_received INTEGER NOT NULL,
  unit_cost NUMERIC(10,2) NOT NULL,
  total_cost NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gr_tenant ON goods_receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gr_items_gr ON goods_receipt_items(goods_receipt_id);

