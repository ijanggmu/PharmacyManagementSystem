"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Users, UserCheck, Calendar, TrendingUp } from "lucide-react"

export default function CustomerInsights() {
  // Mock data - in a real app, this would come from props
  const insights = [
    {
      label: "Active Customers",
      value: "68",
      change: "+12%",
      icon: UserCheck,
      color: "text-green-600",
    },
    {
      label: "New This Month",
      value: "14",
      change: "+8%",
      icon: Calendar,
      color: "text-blue-600",
    },
    {
      label: "Repeat Customers",
      value: "42",
      change: "+5%",
      icon: TrendingUp,
      color: "text-purple-600",
    },
    {
      label: "Total Registered",
      value: "156",
      change: "+18%",
      icon: Users,
      color: "text-orange-600",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {insights.map((insight) => (
        <Card key={insight.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{insight.label}</p>
                <p className="text-2xl font-bold">{insight.value}</p>
                <p className={`text-xs ${insight.color}`}>{insight.change}</p>
              </div>
              <insight.icon className={`h-8 w-8 ${insight.color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
