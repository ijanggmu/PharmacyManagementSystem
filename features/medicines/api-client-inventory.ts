import { apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export type SupplierReceiptLine = {
  medicineId: string
  quantity: number
  unitCost: number
  vatAmount?: number
}

export type SupplierReceiptBatch = {
  supplierId: string
  lines: SupplierReceiptLine[]
}

export async function postInventorySupplierReceipt(params: {
  receiptDate: string
  supplierInvoiceNumber?: string | null
  batches: SupplierReceiptBatch[]
}) {
  const token = await getCSRFToken()
  return apiPost<{ receipts: Array<{ goods_receipt_id: string; receipt_number: string }> }>(
    "/api/inventory/supplier-receipt",
    params,
    token
  )
}
