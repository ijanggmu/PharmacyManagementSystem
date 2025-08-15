"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

// Mock data for customer growth
const mockData = [
  { month: "Jan", customers: 45 },
  { month: "Feb", customers: 52 },
  { month: "Mar", customers: 61 },
  { month: "Apr", customers: 68 },
  { month: "May", customers: 75 },
  { month: "Jun", customers: 82 },
]

export default function CustomerGrowthChart() {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={mockData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="customers" stroke="#10b981" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
