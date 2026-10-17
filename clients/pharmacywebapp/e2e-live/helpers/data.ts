/** Test data shared by several e2e-live flows. */

export interface QaMedicine {
  name: string
  generic: string
  form: string
  strength: string
  barcode?: string
  price: string
  cost: string
  taxable: boolean
  stock: string
  batch: string
  reorder: string
  max: string
  unitsPerPack?: string
  unitLabel?: string
  stripsPerBox?: string
  supplier?: string
  paidAs?: "Opening stock" | "Paid in cash"
  rx?: boolean
  controlled?: boolean
  note: string
}

export const MEDICINES: QaMedicine[] = [
  {
    name: "Cetamol 500mg",
    generic: "Paracetamol",
    form: "Tablet",
    strength: "500mg",
    barcode: "8901234500017",
    price: "2",
    cost: "1.2",
    taxable: false,
    stock: "500",
    batch: "CTM-2410",
    reorder: "100",
    max: "2000",
    unitsPerPack: "10",
    unitLabel: "tablet",
    stripsPerBox: "10",
    paidAs: "Opening stock",
    note: "VAT-exempt, sold by tablet, strip of 10 or box of 10 strips; has a barcode for scanning.",
  },
  {
    name: "Amoxil 500mg",
    generic: "Amoxicillin",
    form: "Capsule",
    strength: "500mg",
    price: "12",
    cost: "8",
    taxable: true,
    stock: "200",
    batch: "AMX-2409",
    reorder: "40",
    max: "1000",
    unitsPerPack: "10",
    unitLabel: "capsule",
    supplier: "Himalayan Pharma Distributors",
    rx: true,
    note: "Prescription-only antibiotic; this opening stock came on a Himalayan Pharma bill.",
  },
  {
    name: "Tramadol 50mg",
    generic: "Tramadol",
    form: "Capsule",
    strength: "50mg",
    price: "15",
    cost: "10",
    taxable: true,
    stock: "60",
    batch: "TRM-2408",
    reorder: "20",
    max: "300",
    unitsPerPack: "10",
    unitLabel: "capsule",
    paidAs: "Paid in cash",
    rx: true,
    controlled: true,
    note: "Controlled (narcotic) — needs a prescription with the doctor's NMC number and goes in the narcotic register.",
  },
  {
    name: "Cetrizine 10mg",
    generic: "Cetirizine",
    form: "Tablet",
    strength: "10mg",
    price: "3",
    cost: "1.5",
    taxable: true,
    stock: "40",
    batch: "CTZ-2411",
    reorder: "50",
    max: "500",
    unitsPerPack: "10",
    unitLabel: "tablet",
    supplier: "Everest Medical Suppliers",
    note: "Stock (40) starts below the reorder level (50), so it shows as low stock and gets reordered later.",
  },
]
