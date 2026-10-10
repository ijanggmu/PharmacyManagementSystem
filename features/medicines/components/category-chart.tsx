"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { CurrencyDisplay } from "@/components/currency-display"

export interface CategoryChartRow {
  category: string
  /** Revenue for this category over the selected date range (whole-period aggregate, not a page sample). */
  value: number
  items: number
}

interface CategoryChartProps {
  data: CategoryChartRow[]
}

/** Revenue by medicine category for the selected period — a whole-period server aggregate, already
 * sorted and ready to plot (see lib/reports/overview-mappers.ts#mapCategoryPerformanceToRows). */
export default function CategoryChart({ data }: CategoryChartProps) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip formatter={(value) => [<CurrencyDisplay amount={Number(value).toFixed(2)} />, "Revenue"]} />
          <Bar dataKey="value" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
