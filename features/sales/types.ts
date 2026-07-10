import { Customer } from "@/features/customers/api-client"

export interface Medicine {
  id: string
  name: string
  generic_name: string | null
  strength: string
  form: string
  unit_price: string
  stock_quantity: number
  category?: string | null
  categories?: { id: string; name: string } | null
  prescription_required?: boolean
}

export interface Prescription {
  id: string
  prescription_number: string
  status?: "pending" | "filled" | "partially_filled" | "cancelled"
  customer_id?: string | null
  customers: {
    id?: string
    first_name: string
    last_name: string
  } | null
  prescription_items: {
    id: string
    quantity_prescribed: number
    quantity_dispensed: number
    medicine_id?: string
    medicines: {
      id: string
      name: string
      strength: string
      form: string
      unit_price?: string
    } | null
  }[]
}

export interface CartItem {
  medicineId: string
  medicineName: string
  strength: string
  form: string
  quantity: number
  unitPrice: number
  totalPrice: number
  availableStock: number
}

export interface CurrentUser {
  full_name?: string
  email?: string
}

export interface NewSaleFormProps {
  customers: Customer[]
  medicines: Medicine[]
  prescriptions: Prescription[]
  currentUser: CurrentUser | null
}

