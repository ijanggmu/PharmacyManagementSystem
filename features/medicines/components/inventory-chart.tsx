"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface InventoryData {
  name: string
  stock_quantity: number
  minimum_stock: number
  categories: { name: string } | null
}

interface InventoryChartProps {
  data: InventoryData[]
}

export default function InventoryChart({ data }: InventoryChartProps) {
  // Take top 10 items by stock quantity
  const chartData = data
    .slice(0, 10)
    .map((item) => ({
      name: item.name.length > 15 ? `${item.name.substring(0, 15)}...` : item.name,
      stock: item.stock_quantity,
      minimum: item.minimum_stock,
    }))
    .reverse() // Reverse to show highest stock at top

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="horizontal">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={100} />
          <Tooltip />
          <Bar dataKey="stock" fill="#3b82f6" name="Current Stock" />
          <Bar dataKey="minimum" fill="#ef4444" name="Minimum Stock" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
