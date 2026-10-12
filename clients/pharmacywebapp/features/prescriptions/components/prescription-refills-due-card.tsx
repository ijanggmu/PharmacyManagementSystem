"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CalendarClock, CalendarCheck, Phone } from "lucide-react"
import { prescriptionRefillsApi, type DueRefillRow } from "@/features/prescriptions/api-client-refills"
import { nepalYmdOf } from "@/lib/utils/nepal-time"

interface PrescriptionRefillsDueCardProps {
  daysAhead?: number
  /** When provided, "View" opens the prescription in place instead of navigating. */
  onOpenPrescription?: (prescriptionId: string) => void
}

export function PrescriptionRefillsDueCard({ daysAhead = 14, onOpenPrescription }: PrescriptionRefillsDueCardProps) {
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

  // Overdue is judged against the pharmacy's (Nepal) calendar day, not the UTC date.
  const today = nepalYmdOf()

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-warning" aria-hidden />
            Refills due
          </CardTitle>
          <CardDescription>Patients whose next refill falls in the next {daysAhead} days</CardDescription>
        </div>
        {rows.length > 0 && (
          <Badge variant="warning" className="num">
            {rows.length} due
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2" role="status" aria-label="Loading refills due">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            <CalendarCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
            No refills due in the next {daysAhead} days. You&apos;re all caught up.
          </div>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {rows.map((r) => {
              const rx = r.prescriptions
              const customer = rx?.customers
              const name = customer
                ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
                : "Patient"
              const due = r.next_refill_date?.slice(0, 10)
              const overdue = !!due && due < today
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={name}>
                      {name}
                      {rx?.prescription_number ? (
                        <span className="font-normal text-muted-foreground"> · #{rx.prescription_number}</span>
                      ) : null}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {due ? (
                        <span className={overdue ? "font-medium text-destructive" : undefined}>
                          {overdue ? "Overdue since" : "Due"} <span className="num">{due}</span>
                        </span>
                      ) : (
                        <span>Refill due soon</span>
                      )}
                      {customer?.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Phone className="h-3 w-3" aria-hidden />
                          <span className="num">{customer.phone}</span>
                        </a>
                      ) : null}
                    </p>
                  </div>
                  {rx?.id &&
                    (onOpenPrescription ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenPrescription(rx.id)}
                        aria-label={`View prescription${rx.prescription_number ? ` #${rx.prescription_number}` : ""} for ${name}`}
                      >
                        View
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/dashboard/prescriptions?highlight=${rx.id}`}
                          aria-label={`View prescription${rx.prescription_number ? ` #${rx.prescription_number}` : ""} for ${name}`}
                        >
                          View
                        </Link>
                      </Button>
                    ))}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
