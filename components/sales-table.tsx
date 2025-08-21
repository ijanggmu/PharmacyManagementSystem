"use client"

import { useState, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoreHorizontal, Eye, Receipt, RefreshCw, Search, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Pagination } from "@/components/ui/pagination"
import { CurrencyDisplay } from "@/components/currency-display"
import SalesDetailModal from "./sales-detail-modal"
import ProcessReturnModal from "./process-return-modal"

interface Sale {
  id: string
  sale_number: string
  total_amount: string
  discount_amount: string
  tax_amount: string
  payment_method: string
  payment_status: string
  sale_date: string
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
  } | null
  sale_items: {
    id: string
    quantity: number
    unit_price: string
    total_price: string
    medicines: {
      id: string
      name: string
      strength: string
      form: string
    } | null
  }[]
}

interface SalesTableProps {
  sales: Sale[]
}

const ITEMS_PER_PAGE = 10

export default function SalesTable({ sales }: SalesTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)

  const filteredSales = useMemo(() => {
    return sales.filter(
      (sale) =>
        sale.sale_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.customers?.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.customers?.last_name.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }, [sales, searchTerm])

  const totalPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedSales = filteredSales.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const getPaymentMethodBadge = (method: string) => {
    switch (method) {
      case "cash":
        return { label: "Cash", variant: "default" as const }
      case "card":
        return { label: "Card", variant: "secondary" as const }
      case "insurance":
        return { label: "Insurance", variant: "outline" as const }
      case "mixed":
        return { label: "Mixed", variant: "secondary" as const }
      default:
        return { label: method, variant: "secondary" as const }
    }
  }

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return { label: "Paid", variant: "default" as const }
      case "pending":
        return { label: "Pending", variant: "secondary" as const }
      case "refunded":
        return { label: "Refunded", variant: "destructive" as const }
      default:
        return { label: status, variant: "secondary" as const }
    }
  }

  const getTotalItems = (items: Sale["sale_items"]) => {
    return items.reduce((sum, item) => sum + item.quantity, 0)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleViewDetails = (sale: Sale) => {
    setSelectedSale(sale)
    setIsDetailModalOpen(true)
  }

  const handlePrintReceipt = (sale: Sale) => {
    setSelectedSale(sale)
    setIsDetailModalOpen(true)
    // The print functionality will be handled in the detail modal
  }

  const handleProcessReturn = (sale: Sale) => {
    setSelectedSale(sale)
    setIsReturnModalOpen(true)
  }

  const handleReturnProcessed = () => {
    // Refresh the sales data or update the UI
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search sales..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sale #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSales.map((sale) => {
              const paymentMethodBadge = getPaymentMethodBadge(sale.payment_method)
              const paymentStatusBadge = getPaymentStatusBadge(sale.payment_status)
              const totalItems = getTotalItems(sale.sale_items)

              return (
                <TableRow key={sale.id}>
                  <TableCell>
                    <div className="font-medium">{sale.sale_number}</div>
                  </TableCell>
                  <TableCell>
                    <div>
                      {sale.customers ? (
                        <>
                          <div className="font-medium">
                            {sale.customers.first_name} {sale.customers.last_name}
                          </div>
                          {sale.customers.phone && <div className="text-sm text-gray-500">{sale.customers.phone}</div>}
                        </>
                      ) : (
                        <div className="text-sm text-gray-500">Walk-in Customer</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{totalItems} items</div>
                      <div className="text-sm text-gray-500">{sale.sale_items.length} products</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        <CurrencyDisplay amount={sale.total_amount} />
                      </div>
                      {Number.parseFloat(sale.discount_amount) > 0 && (
                        <div className="text-sm text-green-600">
                          -<CurrencyDisplay amount={sale.discount_amount} />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={paymentMethodBadge.variant}>{paymentMethodBadge.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={paymentStatusBadge.variant}>{paymentStatusBadge.label}</Badge>
                  </TableCell>
                  <TableCell>{new Date(sale.sale_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetails(sale)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePrintReceipt(sale)}>
                          <Receipt className="h-4 w-4 mr-2" />
                          Print Receipt
                        </DropdownMenuItem>
                        {sale.payment_status === "paid" && (
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleProcessReturn(sale)}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Process Return
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
        totalItems={filteredSales.length}
        itemsPerPage={ITEMS_PER_PAGE}
        startIndex={startIndex}
        onPageChange={handlePageChange}
      />

      {/* Modals */}
      <SalesDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        sale={selectedSale}
        onReturnProcessed={handleReturnProcessed}
      />

      <ProcessReturnModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        sale={selectedSale}
        onSuccess={handleReturnProcessed}
      />
    </div>
  )
}
