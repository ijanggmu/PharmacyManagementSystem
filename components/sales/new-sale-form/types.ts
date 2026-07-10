export type { Customer } from "@/features/customers/api-client"

export interface Medicine {
  id: string
  name: string
  generic_name: string | null
  strength: string
  form: string
  unit_price: string
  stock_quantity: number
  category: string | null
}

export interface Prescription {
  id: string
  prescription_number: string
  customers: {
    first_name: string
    last_name: string
  } | null
  prescription_items: {
    id: string
    quantity_prescribed: number
    quantity_dispensed: number
    medicines: {
      id: string
      name: string
      strength: string
      form: string
      unit_price: string
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











