"use client"

import { useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Users, UserCheck, Calendar, TrendingUp } from "lucide-react"

export interface CustomerInsightsProps {
  customers: { created_at?: string | null }[]
  revenueData: { customer_id?: string | null; sale_date?: string | null }[]
  dateRange?: { from: Date; to: Date }
}

export default function CustomerInsights({ customers, revenueData, dateRange }: CustomerInsightsProps) {
  const insights = useMemo(() => {
    const fromMs = dateRange?.from.getTime() ?? 0
    const toMs = dateRange?.to.getTime() ?? Date.now()

    const newInRange = customers.filter((c) => {
      if (!c.created_at) return false
      const t = new Date(c.created_at).getTime()
      return t >= fromMs && t <= toMs
    }).length

    const saleRows = revenueData.filter((r) => r.sale_date)
    const salesInRange = saleRows.filter((r) => {
      const t = new Date(r.sale_date as string).getTime()
      return t >= fromMs && t <= toMs
    })

    const countsByCustomer = new Map<string, number>()
    for (const row of salesInRange) {
      const id = row.customer_id
      if (!id) continue
      countsByCustomer.set(id, (countsByCustomer.get(id) ?? 0) + 1)
    }

    const activeCustomers = countsByCustomer.size
    let repeatCustomers = 0
    for (const n of countsByCustomer.values()) {
      if (n >= 2) repeatCustomers += 1
    }

    return [
      {
        label: "Active customers",
        value: String(activeCustomers),
        hint: "Distinct buyers in range",
        icon: UserCheck,
        color: "text-green-600",
      },
      {
        label: "New registrations",
        value: String(newInRange),
        hint: "Created in selected range",
        icon: Calendar,
        color: "text-blue-600",
      },
      {
        label: "Repeat buyers",
        value: String(repeatCustomers),
        hint: "2+ sales in range",
        icon: TrendingUp,
        color: "text-purple-600",
      },
      {
        label: "Total registered",
        value: String(customers.length),
        hint: "All customers in workspace",
        icon: Users,
        color: "text-orange-600",
      },
    ]
  }, [customers, revenueData, dateRange])

  return (
    <div className="grid grid-cols-2 gap-4">
      {insights.map((insight) => (
        <Card key={insight.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{insight.label}</p>
                <p className="text-2xl font-bold">{insight.value}</p>
                <p className="text-xs text-muted-foreground">{insight.hint}</p>
              </div>
              <insight.icon className={`h-8 w-8 ${insight.color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
