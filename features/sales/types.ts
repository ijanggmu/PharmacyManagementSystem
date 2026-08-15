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
  is_taxable?: boolean
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
  /** Line total after `discountPercent` is applied: unitPrice * quantity * (1 - discountPercent/100). */
  totalPrice: number
  availableStock: number
  /** Per-line discount, 0-100. */
  discountPercent: number
  /** Copied from medicine.is_taxable at add-to-cart time — determines whether this
   *  line contributes to the tax-inclusive tax breakdown. */
  isTaxable: boolean
}

export interface PaymentLeg {
  method: string
  amount: number
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

