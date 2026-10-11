"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export interface CustomerGrowthPoint {
  month: string
  customers: number
}

export interface CustomerGrowthChartProps {
  /** New customers per calendar month, already bucketed server-side over the whole selected period
   * (see lib/reports/overview-mappers.ts#mapCustomerGrowthPointsToChartRows) — not a page sample. */
  points: CustomerGrowthPoint[]
}

export default function CustomerGrowthChart({ points }: CustomerGrowthChartProps) {
  if (points.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">
        No customers yet for this workspace.
      </div>
    )
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="customers" stroke="var(--chart-2)" strokeWidth={2} name="New customers" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
