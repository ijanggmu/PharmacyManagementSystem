"use client"

import { Wallet, TrendingUp, Receipt, Banknote } from "lucide-react"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { CurrencyDisplay } from "@/components/currency-display"

interface SalesData {
  total_amount: string
  sale_date: string
  payment_method: string
}

interface RevenueMetricsProps {
  salesData: SalesData[]
}

export default function RevenueMetrics({ salesData }: RevenueMetricsProps) {
  const totalRevenue = salesData.reduce((sum, sale) => sum + Number.parseFloat(sale.total_amount), 0)

  // Calculate today's revenue
  const today = new Date().toDateString()
  const todaysRevenue = salesData
    .filter((sale) => new Date(sale.sale_date).toDateString() === today)
    .reduce((sum, sale) => sum + Number.parseFloat(sale.total_amount), 0)

  // Calculate yesterday's revenue for comparison
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdaysRevenue = salesData
    .filter((sale) => new Date(sale.sale_date).toDateString() === yesterday.toDateString())
    .reduce((sum, sale) => sum + Number.parseFloat(sale.total_amount), 0)

  const dailyChange = yesterdaysRevenue > 0 ? ((todaysRevenue - yesterdaysRevenue) / yesterdaysRevenue) * 100 : 0

  // Average transaction value
  const avgTransactionValue = salesData.length > 0 ? totalRevenue / salesData.length : 0

  // Cash vs Card ratio
  const cashSales = salesData.filter((sale) => sale.payment_method === "cash").length
  const cardSales = salesData.filter((sale) => sale.payment_method === "card").length
  const cashRatio = salesData.length > 0 ? (cashSales / salesData.length) * 100 : 0

  return (
    <StatGrid cols={4}>
      <StatCard
        label="Total revenue"
        value={<CurrencyDisplay amount={totalRevenue.toFixed(2)} />}
        hint="Last 30 days"
        icon={Wallet}
        tone="primary"
      />
      <StatCard
        label="Today's revenue"
        value={<CurrencyDisplay amount={todaysRevenue.toFixed(2)} />}
        trend={yesterdaysRevenue > 0 ? dailyChange : undefined}
        hint={yesterdaysRevenue > 0 ? "vs. yesterday" : "No sales yesterday to compare"}
        icon={TrendingUp}
        tone="success"
      />
      <StatCard
        label="Average sale"
        value={<CurrencyDisplay amount={avgTransactionValue.toFixed(2)} />}
        hint={`${salesData.length} ${salesData.length === 1 ? "transaction" : "transactions"}`}
        icon={Receipt}
        tone="info"
      />
      <StatCard
        label="Cash share"
        value={`${cashRatio.toFixed(1)}%`}
        hint={`${cashSales} cash, ${cardSales} card`}
        icon={Banknote}
      />
    </StatGrid>
  )
}
