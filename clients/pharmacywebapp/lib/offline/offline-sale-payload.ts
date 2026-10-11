import type { CreateSaleData } from "@/features/sales/api-client"
import type { LegacyOfflineSalePayload, OfflineSaleRecord } from "@/lib/offline/offline-sales-queue"

/** Checkout body to send for a queued record. New records hold it verbatim; older ones are converted. */
export function offlineRecordToCreateData(record: Pick<OfflineSaleRecord, "version" | "payload">): CreateSaleData {
  if (record.version === 2) return record.payload as CreateSaleData

  const payload = record.payload as LegacyOfflineSalePayload
  return {
    sale_number: "",
    customer_id: payload.customer_id ?? "",
    prescription_id: payload.prescription_id ?? null,
    total_amount: "0.00",
    discount_amount: String(payload.discount_amount ?? 0),
    tax_amount: "0.00",
    payments: payload.payments ?? [],
    payment_status: "paid",
    sale_date: new Date().toISOString(),
    notes: payload.notes,
    override_credit_limit: payload.override_credit_limit === true,
    redeem_loyalty_points: payload.redeem_loyalty_points ?? 0,
    sale_items: (payload.items ?? []).map((item) => {
      const unit = Number(item.unit_price ?? 0)
      const discountPercent = Number(item.discount ?? 0)
      return {
        medicine_id: item.medicine_id,
        quantity: item.quantity,
        unit_price: String(unit),
        total_price: String(item.quantity * unit * (1 - discountPercent / 100)),
        discount_percent: discountPercent,
      }
    }),
  }
}

/** The Idempotency-Key a record is synced under: the original attempt's, or a stable per-record fallback. */
export function offlineRecordKey(record: Pick<OfflineSaleRecord, "id" | "idempotencyKey" | "payload">): string {
  if (record.idempotencyKey) return record.idempotencyKey
  const legacy = record.payload as LegacyOfflineSalePayload
  return legacy.client_request_id ?? `offline-sale-${record.id}`
}
