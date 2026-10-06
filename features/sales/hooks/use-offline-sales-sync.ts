"use client"

import { useEffect, useRef, useState } from "react"
import { enqueueOfflineSale, getPendingOfflineSales, updateOfflineSaleStatus, clearOfflineSale, type OfflineSaleRecord } from "@/lib/offline/offline-sales-queue"
import { useToast } from "@/hooks/use-toast"
import { getCSRFToken } from "@/lib/api/client-helpers"
import { checkoutOnDotnet } from "@/lib/api/backend-target"
import { createSaleOnDotnet } from "@/lib/api/sales-api"
import type { CreateSaleData } from "@/features/sales/api-client"

/** Queued sales carry the legacy checkout body; the .NET side prices every line, so only ids and quantities go across. */
function offlineSaleToCreateData(payload: any): CreateSaleData {
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
    sale_items: (payload.items ?? []).map((item: any) => {
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

interface UseOfflineSalesSyncResult {
  pendingCount: number
}

export function useOfflineSalesSync(): UseOfflineSalesSyncResult {
  const [pendingCount, setPendingCount] = useState(0)
  const { toast } = useToast()
  // Guards against two overlapping sync passes (mount effect + 'online' event firing
  // close together) both reading the same pending records and double-submitting them.
  const syncInFlight = useRef(false)

  useEffect(() => {
    let cancelled = false

    const syncPendingSales = async () => {
      if (syncInFlight.current) return
      syncInFlight.current = true
      try {
        const pending = await getPendingOfflineSales()
        if (cancelled) return
        setPendingCount(pending.length)

        if (pending.length === 0) return

        const csrfToken = await getCSRFToken()

        for (const record of pending) {
          if (!record.id) continue

          try {
            if (checkoutOnDotnet()) {
              // Same key on every retry: the client_request_id set at enqueue, or a stable queue id for older records.
              await createSaleOnDotnet(
                offlineSaleToCreateData(record.payload),
                record.payload?.client_request_id ?? `offline-sale-${record.id}`,
              )
            } else {
              const res = await fetch("/api/sales", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRF-Token": csrfToken,
                },
                body: JSON.stringify(record.payload),
              })

              if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                const message = body?.message || res.statusText || "Failed to sync sale"
                await updateOfflineSaleStatus(record.id, "failed", message)
                continue
              }
            }

            await updateOfflineSaleStatus(record.id, "synced")
            await clearOfflineSale(record.id)
          } catch (error: any) {
            await updateOfflineSaleStatus(
              record.id,
              "failed",
              error instanceof Error ? error.message : "Network error during sync",
            )
          }
        }

        const remaining = await getPendingOfflineSales()
        if (!cancelled) {
          setPendingCount(remaining.length)
        }
      } catch {
        // ignore sync failures at this level
      } finally {
        syncInFlight.current = false
      }
    }

    // Initial sync attempt
    syncPendingSales()

    // Re-sync when we come back online
    const handleOnline = () => {
      syncPendingSales()
      toast({
        title: "Back online",
        description: "Attempting to sync offline sales.",
      })
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline)
    }

    return () => {
      cancelled = true
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline)
      }
    }
  }, [toast])

  return { pendingCount }
}

