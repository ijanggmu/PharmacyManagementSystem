"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Eye, Search, RefreshCw, Calendar, User, DollarSign } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"

interface ReturnItem {
  id: string
  quantity_returned: number
  unit_price: string
  total_amount: string
  reason: string
  medicines: {
    name: string
    strength: string
    form: string
  } | null
}

interface MedicineReturn {
  id: string
  sale_id: string
  customer_id: string | null
  return_date: string
  total_return_amount: string
  return_reason: string
  refund_method: string
  status: string
  created_at: string
  customers: {
    first_name: string
    last_name: string
    phone: string | null
  } | null
  sales: {
    sale_number: string
    total_amount: string
  } | null
  return_items: ReturnItem[]
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<MedicineReturn[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const { toast } = useToast()

  useEffect(() => {
    fetchReturns()
  }, [])

  const fetchReturns = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("medicine_returns")
        .select(`
          *,
          customers (first_name, last_name, phone),
          sales (sale_number, total_amount),
          return_items (
            *,
            medicines (name, strength, form)
          )
        `)
        .order("created_at", { ascending: false })

      if (error) throw error
      setReturns(data || [])
    } catch (error) {
      console.error("Error fetching returns:", error)
      toast({
        title: "Error",
        description: "Failed to load returns data",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const filteredReturns = returns.filter(returnItem => {
    const matchesSearch = 
      returnItem.sales?.sale_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      returnItem.customers?.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      returnItem.customers?.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      returnItem.return_reason.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "all" || returnItem.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedReturns = filteredReturns.slice(startIndex, startIndex + itemsPerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return { label: "Completed", variant: "default" as const }
      case "pending":
        return { label: "Pending", variant: "secondary" as const }
      case "cancelled":
        return { label: "Cancelled", variant: "destructive" as const }
      default:
        return { label: status, variant: "secondary" as const }
    }
  }

  const getRefundMethodBadge = (method: string) => {
    switch (method) {
      case "original":
        return { label: "Original Method", variant: "outline" as const }
      case "cash":
        return { label: "Cash", variant: "default" as const }
      case "store_credit":
        return { label: "Store Credit", variant: "secondary" as const }
      default:
        return { label: method, variant: "secondary" as const }
    }
  }

  const totalReturnAmount = returns.reduce((sum, returnItem) => 
    sum + Number.parseFloat(returnItem.total_return_amount), 0
  )

  const completedReturns = returns.filter(r => r.status === "completed").length
  const pendingReturns = returns.filter(r => r.status === "pending").length

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading returns...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Returns Management</h1>
            <p className="text-gray-600">View and manage medicine returns</p>
          </div>
          <Button variant="outline" onClick={fetchReturns}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
              <RefreshCw className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{returns.length}</div>
              <p className="text-xs text-muted-foreground">All time returns</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <Calendar className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedReturns}</div>
              <p className="text-xs text-muted-foreground">Successfully processed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Calendar className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingReturns}</div>
              <p className="text-xs text-muted-foreground">Awaiting processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <CurrencyDisplay amount={totalReturnAmount.toFixed(2)} />
              </div>
              <p className="text-xs text-muted-foreground">Total returned value</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Returns</CardTitle>
            <CardDescription>View and manage all medicine returns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search returns..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value)
                setCurrentPage(1)
              }}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return ID</TableHead>
                    <TableHead>Sale #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedReturns.map((returnItem) => {
                    const statusBadge = getStatusBadge(returnItem.status)
                    const refundMethodBadge = getRefundMethodBadge(returnItem.refund_method)
                    const totalItems = returnItem.return_items.reduce((sum, item) => sum + item.quantity_returned, 0)

                    return (
                      <TableRow key={returnItem.id}>
                        <TableCell>
                          <div className="font-medium">{returnItem.id.slice(-8).toUpperCase()}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{returnItem.sales?.sale_number || "N/A"}</div>
                        </TableCell>
                        <TableCell>
                          <div>
                            {returnItem.customers ? (
                              <>
                                <div className="font-medium">
                                  {returnItem.customers.first_name} {returnItem.customers.last_name}
                                </div>
                                {returnItem.customers.phone && (
                                  <div className="text-sm text-gray-500">{returnItem.customers.phone}</div>
                                )}
                              </>
                            ) : (
                              <div className="text-sm text-gray-500">Walk-in Customer</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{totalItems} items</div>
                            <div className="text-sm text-gray-500">{returnItem.return_items.length} products</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            <CurrencyDisplay amount={returnItem.total_return_amount} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={refundMethodBadge.variant}>{refundMethodBadge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{new Date(returnItem.return_date).toLocaleDateString()}</div>
                            <div className="text-sm text-gray-500">{new Date(returnItem.return_date).toLocaleTimeString()}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredReturns.length}
              itemsPerPage={itemsPerPage}
              startIndex={startIndex}
              onPageChange={setCurrentPage}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
