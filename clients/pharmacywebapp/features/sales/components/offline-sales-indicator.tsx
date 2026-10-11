"use client"

import { AlertTriangle, RefreshCw, Trash2, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useOfflineSalesSync } from "@/features/sales/hooks/use-offline-sales-sync"
import type { CreateSaleData } from "@/features/sales/api-client"

function recordTotal(payload: unknown): string {
  const total = (payload as Partial<CreateSaleData>)?.total_amount
  return typeof total === "string" && total !== "0.00" ? total : "—"
}

/**
 * Shows sales the POS could not confirm with the server. Pending ones retry automatically with backoff;
 * failed ones were rejected by the server and need someone to retry (after fixing the cause) or discard.
 */
export default function OfflineSalesIndicator() {
  const { pendingCount, failedCount, records, retry, discard, syncNow } = useOfflineSalesSync()
  if (pendingCount === 0 && failedCount === 0) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={failedCount > 0 ? "min-h-10 gap-1.5 border-destructive/40 text-destructive" : "min-h-10 gap-1.5"}
          aria-label={`${pendingCount} offline sales waiting to sync, ${failedCount} need attention`}
        >
          {failedCount > 0 ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
          {pendingCount > 0 && <span>{pendingCount} to sync</span>}
          {failedCount > 0 && <span>{failedCount} failed</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Offline sales</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void syncNow()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
            Sync now
          </Button>
        </div>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {records.map((record) => (
            <li key={record.id} className="rounded-md border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {new Date(record.createdAt).toLocaleString()} · {recordTotal(record.payload)}
                </span>
                <span className={record.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                  {record.status === "failed" ? "Needs attention" : `Retry ${record.attempts ?? 0}`}
                </span>
              </div>
              {record.lastError && <p className="mt-1 text-muted-foreground">{record.lastError}</p>}
              {record.id !== undefined && (
                <div className="mt-1.5 flex justify-end gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => void retry(record.id!)}>
                    Retry
                  </Button>
                  {record.status === "failed" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (window.confirm("Discard this sale? It will not be recorded.")) void discard(record.id!)
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Discard
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
