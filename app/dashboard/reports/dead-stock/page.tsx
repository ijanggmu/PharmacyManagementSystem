"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PackageX } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "@/components/currency-display"
import { apiGet, apiRequestErrorMessage } from "@/lib/api/client-helpers"

interface DeadStockRow {
  medicine_id: string
  medicine_name: string
  supplier_name: string | null
  stock_quantity: number
  inventory_value: number
  last_sold_date: string | null
  expiry_date: string | null
}

export default function DeadStockReportPage() {
  const [rows, setRows] = useState<DeadStockRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sinceDays, setSinceDays] = useState("90")
  const { toast } = useToast()

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const data = await apiGet<DeadStockRow[]>(`/api/reports/dead-stock?sinceDays=${sinceDays}`)
        setRows(data ?? [])
      } catch (error) {
        toast({ title: "Failed to load dead stock report", description: apiRequestErrorMessage(error), variant: "destructive" })
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceDays])

  const totalValue = rows.reduce((sum, r) => sum + r.inventory_value, 0)

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Dead Stock"
          description="Medicines sitting in inventory with no sale in the selected window — money tied up, doing nothing"
        />

        <Section spacing="lg">
          <div className="flex items-end gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="w-48">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{rows.length}</div>
                </CardContent>
              </Card>
              <Card className="w-48">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Value Tied Up</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    <CurrencyDisplay amount={totalValue} />
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="ml-auto space-y-1.5">
              <label className="text-sm font-medium">No sale in</label>
              <Select value={sinceDays} onValueChange={setSinceDays}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">365 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageX className="h-4 w-4" />
                Slow-Moving Inventory
              </CardTitle>
              <CardDescription>Sorted by value tied up, highest first</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : rows.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  Nothing sitting idle for this window — everything in stock has moved recently.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Last Sold</TableHead>
                        <TableHead>Expiry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.medicine_id}>
                          <TableCell className="font-medium">{r.medicine_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.supplier_name || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.stock_quantity}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            <CurrencyDisplay amount={r.inventory_value} />
                          </TableCell>
                          <TableCell className="text-sm">{r.last_sold_date ? new Date(r.last_sold_date).toLocaleDateString() : "Never sold"}</TableCell>
                          <TableCell className="text-sm">{r.expiry_date || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
