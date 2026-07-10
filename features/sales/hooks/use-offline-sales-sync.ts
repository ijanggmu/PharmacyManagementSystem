"use client"

import { useEffect, useRef, useState } from "react"
import { enqueueOfflineSale, getPendingOfflineSales, updateOfflineSaleStatus, clearOfflineSale, type OfflineSaleRecord } from "@/lib/offline/offline-sales-queue"
import { useToast } from "@/hooks/use-toast"
import { getCSRFToken } from "@/lib/api/client-helpers"

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

