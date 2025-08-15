"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface InventoryData {
  name: string
  stock_quantity: number
  unit_price: string
  categories: { name: string } | null
}

interface CategoryChartProps {
  data: InventoryData[]
}

export default function CategoryChart({ data }: CategoryChartProps) {
  // Group by category and calculate total value
  const categoryData = data.reduce((acc: { [key: string]: { value: number; items: number } }, item) => {
    const category = item.categories?.name || "Uncategorized"
    const value = item.stock_quantity * Number.parseFloat(item.unit_price)

    if (!acc[category]) {
      acc[category] = { value: 0, items: 0 }
    }
    acc[category].value += value
    acc[category].items += 1
    return acc
  }, {})

  const chartData = Object.entries(categoryData)
    .map(([category, data]) => ({
      category,
      value: data.value,
      items: data.items,
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, "Inventory Value"]} />
          <Bar dataKey="value" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
