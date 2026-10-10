"use client"

import { useMemo } from "react"
import { StatCard, type StatTone } from "@/components/shared/stat-card"
import { Users, UserCheck, Calendar, TrendingUp, Crown } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"

export interface TopCustomerInsight {
  name: string
  totalSpend: number
}

export interface CustomerInsightsProps {
  customers: { created_at?: string | null }[]
  revenueData: { customer_id?: string | null; sale_date?: string | null }[]
  dateRange?: { from: Date; to: Date }
  /** Highest spender for the selected period, from the whole-period top-customers aggregate — not a
   * page sample. Null while loading or when no customer has a sale in range. */
  topCustomer?: TopCustomerInsight | null
}

export default function CustomerInsights({ customers, revenueData, dateRange, topCustomer }: CustomerInsightsProps) {
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
        tone: "success" as StatTone,
      },
      {
        label: "New registrations",
        value: String(newInRange),
        hint: "Created in selected range",
        icon: Calendar,
        tone: "info" as StatTone,
      },
      {
        label: "Repeat buyers",
        value: String(repeatCustomers),
        hint: "2+ sales in range",
        icon: TrendingUp,
        tone: "primary" as StatTone,
      },
      {
        label: "Total registered",
        value: String(customers.length),
        hint: "All customers in workspace",
        icon: Users,
        tone: "default" as StatTone,
      },
    ]
  }, [customers, revenueData, dateRange])

  const topCustomerCard = topCustomer
    ? {
        label: "Top spender",
        value: topCustomer.name,
        hint: <CurrencyDisplay amount={topCustomer.totalSpend.toFixed(2)} />,
        icon: Crown,
        tone: "primary" as StatTone,
      }
    : null

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {topCustomerCard && (
        <StatCard
          key={topCustomerCard.label}
          label={topCustomerCard.label}
          value={topCustomerCard.value}
          hint={topCustomerCard.hint}
          icon={topCustomerCard.icon}
          tone={topCustomerCard.tone}
        />
      )}
      {insights.map((insight) => (
        <StatCard
          key={insight.label}
          label={insight.label}
          value={insight.value}
          hint={insight.hint}
          icon={insight.icon}
          tone={insight.tone}
        />
      ))}
    </div>
  )
}
