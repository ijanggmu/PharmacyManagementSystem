"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface SalesData {
  sale_date: string
  total_amount: string
}

interface SalesChartProps {
  data: SalesData[]
}

export default function SalesChart({ data }: SalesChartProps) {
  // Group sales by date and sum amounts
  const chartData = data.reduce((acc: { [key: string]: number }, sale) => {
    const date = new Date(sale.sale_date).toLocaleDateString()
    acc[date] = (acc[date] || 0) + Number.parseFloat(sale.total_amount)
    return acc
  }, {})

  const formattedData = Object.entries(chartData).map(([date, amount]) => ({
    date,
    sales: amount,
  }))

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, "Sales"]} />
          <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
