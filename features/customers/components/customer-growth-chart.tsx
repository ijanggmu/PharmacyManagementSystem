"use client"

import { useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

function monthStartsBetween(from: Date, to: Date): Date[] {
  const months: Date[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  while (cursor <= end) {
    months.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

export interface CustomerGrowthChartProps {
  customers: { created_at?: string | null }[]
  dateRange?: { from: Date; to: Date }
}

export default function CustomerGrowthChart({ customers, dateRange }: CustomerGrowthChartProps) {
  const data = useMemo(() => {
    const from = dateRange?.from ?? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    const to = dateRange?.to ?? new Date()
    const months = monthStartsBetween(from, to)

    return months.map((monthStart) => {
      const next = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
      const label = monthStart.toLocaleString(undefined, { month: "short", year: "numeric" })
      const count = customers.filter((c) => {
        if (!c.created_at) return false
        const created = new Date(c.created_at)
        return created >= monthStart && created < next
      }).length
      return { month: label, customers: count }
    })
  }, [customers, dateRange])

  if (customers.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">
        No customers yet for this workspace.
      </div>
    )
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="customers" stroke="#10b981" strokeWidth={2} name="New customers" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
