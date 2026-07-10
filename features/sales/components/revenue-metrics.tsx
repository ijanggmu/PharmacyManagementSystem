"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, TrendingUp, TrendingDown, CreditCard } from "lucide-react"
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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          <DollarSign className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold"><CurrencyDisplay amount={totalRevenue.toFixed(2)}/></div>
          <p className="text-xs text-muted-foreground">Last 30 days</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
          {dailyChange >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold"><CurrencyDisplay amount = {todaysRevenue.toFixed(2)}/></div>
          <p className={`text-xs ${dailyChange >= 0 ? "text-green-600" : "text-red-600"}`}>
            {dailyChange >= 0 ? "+" : ""}
            {dailyChange.toFixed(1)}% from yesterday
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Transaction</CardTitle>
          <CreditCard className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold"><CurrencyDisplay amount={avgTransactionValue.toFixed(2)}/></div>
          <p className="text-xs text-muted-foreground">{salesData.length} transactions</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cash Ratio</CardTitle>
          <DollarSign className="h-4 w-4 text-purple-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{cashRatio.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">
            {cashSales} cash, {cardSales} card
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
