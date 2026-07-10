"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CalendarClock, Loader2 } from "lucide-react"
import { prescriptionRefillsApi, type DueRefillRow } from "@/features/prescriptions/api-client-refills"

export function PrescriptionRefillsDueCard({ daysAhead = 14 }: { daysAhead?: number }) {
  const [rows, setRows] = useState<DueRefillRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data } = await prescriptionRefillsApi.getDueRefills(daysAhead)
        if (!cancelled) {
          const sorted = [...(data || [])].sort((a, b) =>
            String(a.next_refill_date || "").localeCompare(String(b.next_refill_date || ""))
          )
          setRows(sorted.slice(0, 8))
        }
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [daysAhead])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Refills due
          </CardTitle>
          <CardDescription>Next {daysAhead} days (by last refill schedule)</CardDescription>
        </div>
        {rows.length > 0 && <Badge variant="secondary">{rows.length}</Badge>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No refills due in this window.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const rx = r.prescriptions
              const customer = rx?.customers
              const name = customer
                ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
                : "Patient"
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {name}
                      {rx?.prescription_number ? ` · #${rx.prescription_number}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {r.next_refill_date?.slice(0, 10) ?? "—"}
                      {customer?.phone ? ` · ${customer.phone}` : ""}
                    </p>
                  </div>
                  {rx?.id && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/prescriptions?highlight=${rx.id}`}>View</Link>
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
