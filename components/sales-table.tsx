"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MoreHorizontal, Eye, Receipt, Search, Plus } from "lucide-react"
import Link from "next/link"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Pagination } from "@/components/ui/pagination"
import { CurrencyDisplay } from "@/components/currency-display"
import { useSales, useDeleteSale, useUpdateSalePaymentStatus } from "@/lib/hooks/use-sales"
import { Sale, SalesFilters } from "@/lib/api/sales"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import SalesDetailModal from "./sales-detail-modal"
import ProcessReturnModal from "./process-return-modal"
// import CreateSaleModal from "./create-sale-modal"

interface SalesTableProps {
  filters?: SalesFilters
}

const ITEMS_PER_PAGE = 10

export default function SalesTable({ filters }: SalesTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<Sale['payment_status'] | "all">("all")
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<Sale['payment_method'] | "all">("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null)

  // Combine local filters with props filters
  const combinedFilters: SalesFilters = {
    ...filters,
    search: searchTerm || undefined,
    paymentStatus: paymentStatusFilter !== "all" ? paymentStatusFilter : undefined,
    paymentMethod: paymentMethodFilter !== "all" ? paymentMethodFilter : undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch sales
  const { data: salesResponse, isLoading, error } = useSales(combinedFilters)
  const deleteSaleMutation = useDeleteSale()
  const updatePaymentStatusMutation = useUpdateSalePaymentStatus()

  const sales = salesResponse?.data || []
  const salesError = salesResponse?.error

  const getPaymentStatusBadge = (status: Sale['payment_status']) => {
    switch (status) {
      case "pending":
        return { label: "Pending", variant: "secondary" as const }
      case "completed":
        return { label: "Completed", variant: "default" as const }
      case "failed":
        return { label: "Failed", variant: "destructive" as const }
      case "refunded":
        return { label: "Refunded", variant: "outline" as const }
      default:
        return { label: status, variant: "secondary" as const }
    }
  }

  const getPaymentMethodBadge = (method: Sale['payment_method']) => {
    switch (method) {
      case "cash":
        return { label: "Cash", variant: "default" as const }
      case "card":
        return { label: "Card", variant: "secondary" as const }
      case "insurance":
        return { label: "Insurance", variant: "outline" as const }
      case "other":
        return { label: "Other", variant: "outline" as const }
      default:
        return { label: method, variant: "secondary" as const }
    }
  }

  const getTotalItems = (items: Sale['sale_items']) => {
    return items.reduce((sum, item) => sum + item.quantity, 0)
  }

  const handleViewDetails = (sale: Sale) => {
    setSelectedSale(sale)
    setIsDetailModalOpen(true)
  }

  const handleProcessReturn = (sale: Sale) => {
    setSelectedSale(sale)
    setIsReturnModalOpen(true)
  }

  const handlePaymentStatusChange = async (sale: Sale, newStatus: Sale['payment_status']) => {
    try {
      await updatePaymentStatusMutation.mutateAsync({ id: sale.id, paymentStatus: newStatus })
    } catch (error) {
      console.error("Failed to update payment status:", error)
    }
  }

  const handleDeleteClick = (sale: Sale) => {
    setSaleToDelete(sale)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!saleToDelete) return

    // Store the sale before clearing state
    const sale = saleToDelete

    // Close dialog immediately to prevent UI freezing
    setIsDeleteDialogOpen(false)
    setSaleToDelete(null)

    try {
      // Execute the delete mutation
      deleteSaleMutation.mutate(sale.id)
    } catch (error) {
      // Fallback error handling
      console.error("Delete operation failed:", error)
    }
  }

  const handleUpdate = () => {
    // TanStack Query will automatically refetch when needed
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search sales..."
                disabled
                className="pl-10"
              />
            </div>
            <Select disabled value="all">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
            </Select>
            <Select disabled value="all">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
            </Select>
          </div>
          <Button asChild>
            <Link href="/dashboard/sales/new">
              <Plus className="h-4 w-4 mr-2" />
              New Sale
            </Link>
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-sm text-muted-foreground">Loading sales...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error || salesError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search sales..."
                disabled
                className="pl-10"
              />
            </div>
            <Select disabled value="all">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
            </Select>
            <Select disabled value="all">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
            </Select>
          </div>
          <Button asChild>
            <Link href="/dashboard/sales/new">
              <Plus className="h-4 w-4 mr-2" />
              New Sale
            </Link>
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <p className="text-red-500">Failed to load sales</p>
            <p className="text-sm text-muted-foreground mt-1">
              {error?.message || salesError || "Please try again later"}
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
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
          <Select value={paymentStatusFilter} onValueChange={(value) => {
            setPaymentStatusFilter(value as Sale['payment_status'] | "all")
            setCurrentPage(1)
          }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentMethodFilter} onValueChange={(value) => {
            setPaymentMethodFilter(value as Sale['payment_method'] | "all")
            setCurrentPage(1)
          }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="insurance">Insurance</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button asChild>
          <Link href="/dashboard/sales/new">
            <Plus className="h-4 w-4 mr-2" />
            New Sale
          </Link>
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sale #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => {
              const paymentStatus = getPaymentStatusBadge(sale.payment_status)
              const paymentMethod = getPaymentMethodBadge(sale.payment_method)
              const totalItems = getTotalItems(sale.sale_items)

              return (
                <TableRow key={sale.id}>
                  <TableCell>
                    <div className="font-medium">{sale.sale_number}</div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {sale.customers?.first_name} {sale.customers?.last_name}
                      </div>
                      {sale.customers?.phone && (
                        <div className="text-sm text-muted-foreground">{sale.customers.phone}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{totalItems} items</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      <CurrencyDisplay amount={sale.total_amount} />
                    </div>
                    {parseFloat(sale.discount_amount) > 0 && (
                      <div className="text-sm text-muted-foreground">
                        -<CurrencyDisplay amount={sale.discount_amount} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={paymentMethod.variant}>{paymentMethod.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={paymentStatus.variant}>{paymentStatus.label}</Badge>
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
                        <DropdownMenuItem onClick={() => handleProcessReturn(sale)}>
                          <Receipt className="h-4 w-4 mr-2" />
                          Process Return
                        </DropdownMenuItem>
                        {sale.payment_status === "pending" && (
                          <DropdownMenuItem onClick={() => handlePaymentStatusChange(sale, "completed")}>
                            <Receipt className="h-4 w-4 mr-2" />
                            Mark as Completed
                          </DropdownMenuItem>
                        )}
                        {sale.payment_status === "pending" && (
                          <DropdownMenuItem onClick={() => handlePaymentStatusChange(sale, "failed")}>
                            <Receipt className="h-4 w-4 mr-2" />
                            Mark as Failed
                          </DropdownMenuItem>
                        )}
                        {sale.payment_status === "completed" && (
                          <DropdownMenuItem onClick={() => handlePaymentStatusChange(sale, "refunded")}>
                            <Receipt className="h-4 w-4 mr-2" />
                            Mark as Refunded
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteClick(sale)}>
                          <Receipt className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
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
        totalPages={Math.ceil(sales.length / ITEMS_PER_PAGE)}
        totalItems={sales.length}
        itemsPerPage={ITEMS_PER_PAGE}
        startIndex={(currentPage - 1) * ITEMS_PER_PAGE}
        onPageChange={handlePageChange}
      />

      <SalesDetailModal
        sale={selectedSale}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      {/* <CreateSaleModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleUpdate}
      /> */}

      <ProcessReturnModal
        sale={selectedSale}
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        onSuccess={handleUpdate}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setSaleToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Sale"
        description={`Are you sure you want to delete sale ${saleToDelete?.sale_number}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}
