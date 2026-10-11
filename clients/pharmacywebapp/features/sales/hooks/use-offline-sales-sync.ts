"use client"

import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  OFFLINE_SALES_CHANGED_EVENT,
  clearOfflineSale,
  getOfflineSales,
  putOfflineSale,
  type OfflineSaleRecord,
} from "@/lib/offline/offline-sales-queue"
import { afterFailure, isDue } from "@/lib/offline/offline-sale-retry"
import { offlineRecordKey, offlineRecordToCreateData } from "@/lib/offline/offline-sale-payload"
import { useToast } from "@/hooks/use-toast"
import { postSaleOnDotnet } from "@/lib/api/sales-api"

/** How often due records are retried while a page using this hook is open. */
const SYNC_INTERVAL_MS = 30_000

/**
 * One sync pass at a time across every mounted hook (the layout and the POS both use it), so two passes
 * never submit the same record concurrently.
 */
let syncInFlight: Promise<number> | null = null

/** Sends every due pending record. Returns how many were recorded by the server. */
export function syncOfflineSales(force = false): Promise<number> {
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    let synced = 0
    try {
      const records = await getOfflineSales()
      for (const record of records) {
        if (record.id === undefined) continue
        if (!force && !isDue(record)) continue
        if (force && record.status !== "pending") continue
        try {
          // Same key as the original attempt: a sale the server already recorded is replayed, not duplicated.
          // Only the POST matters here; nothing is read back, so a flaky read can't re-queue a recorded sale.
          await postSaleOnDotnet(offlineRecordToCreateData(record), offlineRecordKey(record))
          await clearOfflineSale(record.id)
          synced += 1
        } catch (error) {
          await putOfflineSale(afterFailure(record, error))
        }
      }
    } catch {
      // IndexedDB unavailable or similar — nothing to sync.
    } finally {
      syncInFlight = null
    }
    return synced
  })()
  return syncInFlight
}

export interface UseOfflineSalesSyncResult {
  /** Waiting to sync (will retry automatically). */
  pendingCount: number
  /** Rejected by the server; needs someone to retry after fixing the cause, or discard. */
  failedCount: number
  records: OfflineSaleRecord[]
  /** Re-queue one record (failed or pending) for an immediate attempt. */
  retry: (id: number) => Promise<void>
  /** Drops a record from the queue (the sale will not be recorded). */
  discard: (id: number) => Promise<void>
  syncNow: () => Promise<void>
}

export function useOfflineSalesSync(): UseOfflineSalesSyncResult {
  const [records, setRecords] = useState<OfflineSaleRecord[]>([])
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const refresh = useCallback(async () => {
    try {
      setRecords(await getOfflineSales())
    } catch {
      setRecords([])
    }
  }, [])

  const runSync = useCallback(
    async (force = false) => {
      const synced = await syncOfflineSales(force)
      if (synced > 0) {
        toast({ title: "Offline sales synced", description: `${synced} queued ${synced === 1 ? "sale was" : "sales were"} recorded.` })
        void queryClient.invalidateQueries({ queryKey: ["sales"] })
        void queryClient.invalidateQueries({ queryKey: ["medicines"] })
      }
      await refresh()
    },
    [queryClient, refresh, toast],
  )

  useEffect(() => {
    void refresh()
    void runSync()

    const handleOnline = () => {
      toast({ title: "Back online", description: "Attempting to sync offline sales." })
      void runSync(true)
    }
    const handleChanged = () => void refresh()
    const timer = setInterval(() => void runSync(), SYNC_INTERVAL_MS)

    window.addEventListener("online", handleOnline)
    window.addEventListener(OFFLINE_SALES_CHANGED_EVENT, handleChanged)
    return () => {
      clearInterval(timer)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener(OFFLINE_SALES_CHANGED_EVENT, handleChanged)
    }
  }, [refresh, runSync, toast])

  const retry = useCallback(
    async (id: number) => {
      const record = records.find((r) => r.id === id)
      if (!record) return
      await putOfflineSale({ ...record, status: "pending", nextAttemptAt: null })
      await runSync()
    },
    [records, runSync],
  )

  const discard = useCallback(async (id: number) => {
    await clearOfflineSale(id)
  }, [])

  return {
    pendingCount: records.filter((r) => r.status === "pending").length,
    failedCount: records.filter((r) => r.status === "failed").length,
    records,
    retry,
    discard,
    syncNow: () => runSync(true),
  }
}
