// Core entity types
export interface Medicine {
  id: string
  name: string
  generic_name: string
  brand_name: string
  dosage: string
  form: MedicineForm
  strength: string
  unit_price: string
  cost_price: string
  stock_quantity: number
  minimum_stock: number
  maximum_stock: number
  expiry_date: string
  batch_number: string | null
  prescription_required: boolean
  controlled_substance: boolean
  barcode: string | null
  side_effects: string | null
  storage_instructions: string | null
  category_id: string | null
  supplier_id: string | null
  created_at: string
  updated_at: string
  categories?: Category
  suppliers?: Supplier
}

export interface Customer {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  address: string | null
  date_of_birth: string | null
  insurance_provider: string | null
  insurance_number: string | null
  emergency_contact: string | null
  created_at: string
  updated_at: string
  prescriptions?: Prescription[]
  sales?: Sale[]
}

export interface Prescription {
  id: string
  prescription_number: string
  customer_id: string
  doctor_name: string
  doctor_license: string | null
  issue_date: string
  status: PrescriptionStatus
  notes: string | null
  filled_at: string | null
  created_at: string
  updated_at: string
  customers?: Customer
  prescription_items?: PrescriptionItem[]
}

export interface PrescriptionItem {
  id: string
  prescription_id: string
  medicine_id: string
  quantity_prescribed: number
  quantity_dispensed: number
  instructions: string | null
  dispensed_at: string | null
  created_at: string
  medicines?: Medicine
}

export interface Sale {
  id: string
  customer_id: string | null
  subtotal_amount: string
  discount_amount: string
  tax_amount: string
  total_amount: string
  payment_method: PaymentMethod
  notes: string | null
  created_at: string
  customers?: Customer
  sale_items?: SaleItem[]
}

export interface SaleItem {
  id: string
  sale_id: string
  medicine_id: string
  quantity: number
  unit_price: string
  discount_amount: string
  total_amount: string
  medicines?: Medicine
}

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

// Enums
export type MedicineForm = "tablet" | "capsule" | "syrup" | "injection" | "cream" | "drops" | "inhaler" | "patch"
export type PrescriptionStatus = "pending" | "filled" | "partially_filled" | "cancelled" | "expired"
export type PaymentMethod = "cash" | "card" | "insurance" | "check"
export type UserRole = "admin" | "pharmacist" | "cashier"

// API Response types
export interface ApiResponse<T = any> {
  data: T
  error: string | null
  success: boolean
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// Form types
export interface MedicineFormData {
  name: string
  generic_name: string
  brand_name: string
  dosage: string
  form: MedicineForm
  strength: string
  unit_price: string
  cost_price: string
  stock_quantity: number
  minimum_stock: number
  maximum_stock: number
  expiry_date: string
  prescription_required: boolean
  barcode?: string
  side_effects?: string
  storage_instructions?: string
  category_id?: string
  supplier_id?: string
}

export interface CustomerFormData {
  first_name: string
  last_name: string
  email?: string
  phone?: string
  address?: string
  date_of_birth?: string
  insurance_number?: string
  emergency_contact?: string
}

export interface PrescriptionFormData {
  prescription_number: string
  customer_id: string
  doctor_name: string
  doctor_license?: string
  issue_date: string
  notes?: string
  items: PrescriptionItemFormData[]
}

export interface PrescriptionItemFormData {
  medicine_id: string
  quantity_prescribed: number
  instructions?: string
}

// Filter and search types
export interface MedicineFilters {
  search?: string
  category?: string
  supplier?: string
  stockStatus?: "all" | "in" | "low" | "out"
  expiryStatus?: "all" | "expiring" | "expired"
  prescriptionRequired?: boolean
}

export interface CustomerFilters {
  search?: string
  hasInsurance?: boolean
  ageRange?: "all" | "child" | "adult" | "senior"
}

export interface PrescriptionFilters {
  search?: string
  status?: PrescriptionStatus | "all"
  dateRange?: {
    start: string
    end: string
  }
  doctor?: string
}

// Analytics types
export interface InventoryAnalytics {
  totalMedicines: number
  lowStockCount: number
  expiredCount: number
  expiringSoonCount: number
  totalValue: number
  topSellingMedicines: Array<{
    medicine: Medicine
    quantitySold: number
    revenue: number
  }>
}

export interface SalesAnalytics {
  totalSales: number
  totalRevenue: number
  averageSaleValue: number
  paymentMethodBreakdown: Record<PaymentMethod, number>
  dailySales: Array<{
    date: string
    sales: number
    revenue: number
  }>
  topCustomers: Array<{
    customer: Customer
    totalSpent: number
    totalPurchases: number
  }>
}

export interface PrescriptionAnalytics {
  totalPrescriptions: number
  filledPrescriptions: number
  pendingPrescriptions: number
  averageFillTime: number
  topDoctors: Array<{
    doctorName: string
    prescriptionCount: number
  }>
  medicationFrequency: Array<{
    medicine: Medicine
    prescriptionCount: number
  }>
}
