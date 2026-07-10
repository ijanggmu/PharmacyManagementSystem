"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

interface SalesData {
  payment_method: string
  total_amount: string
}

interface PaymentMethodChartProps {
  data: SalesData[]
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"]

export default function PaymentMethodChart({ data }: PaymentMethodChartProps) {
  // Group by payment method
  const paymentData = data.reduce((acc: { [key: string]: number }, sale) => {
    acc[sale.payment_method] = (acc[sale.payment_method] || 0) + Number.parseFloat(sale.total_amount)
    return acc
  }, {})

  const chartData = Object.entries(paymentData).map(([method, amount]) => ({
    name: method.charAt(0).toUpperCase() + method.slice(1),
    value: amount,
  }))

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
