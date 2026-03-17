"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MultiSelect } from "@/components/ui/multi-select"
import { MoreHorizontal, Eye, Receipt, Plus } from "lucide-react"
import Link from "next/link"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { CurrencyDisplay } from "@/components/currency-display"
import { useSales, useDeleteSale, useUpdateSalePaymentStatus } from "@/lib/hooks/use-sales"
import { Sale, SalesFilters } from "@/lib/api/sales"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import SalesDetailModal from "./sales-detail-modal"
import ProcessReturnModal from "./process-return-modal"

interface SalesTableProps {
  filters?: SalesFilters
}

const ITEMS_PER_PAGE = 10

export default function SalesTable({ filters }: SalesTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [paymentStatuses, setPaymentStatuses] = useState<Sale['payment_status'][]>([])
  const [paymentMethods, setPaymentMethods] = useState<Sale['payment_method'][]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null)

  const combinedFilters: SalesFilters = {
    ...filters,
    search: searchTerm || undefined,
    paymentStatuses: paymentStatuses.length > 0 ? paymentStatuses : undefined,
    paymentMethods: paymentMethods.length > 0 ? paymentMethods : undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch sales
  const { data: salesResponse, isLoading, error } = useSales(combinedFilters)
  const deleteSaleMutation = useDeleteSale()
  const updatePaymentStatusMutation = useUpdateSalePaymentStatus()

  const sales = salesResponse?.data || []
  const salesError = salesResponse?.error
  const totalCount = salesResponse?.total ?? sales.length

  // Server-side pagination - API handles pagination
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  const getPaymentStatusBadge = (status: Sale['payment_status']) => {
    switch (status) {
      case "pending":
        return { label: "Pending", variant: "secondary" as const }
      case "paid":
        return { label: "Paid", variant: "default" as const }
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
      case "fonepay":
        return { label: "Fonepay", variant: "secondary" as const }
      case "esewa":
        return { label: "eSewa", variant: "secondary" as const }
      case "khalti":
        return { label: "Khalti", variant: "secondary" as const }
      case "bank":
        return { label: "Bank Transfer", variant: "outline" as const }
      case "mixed":
        return { label: "Mixed", variant: "outline" as const }
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

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Define columns
  const columns: Column<Sale>[] = [
    {
      key: "saleNumber",
      header: "Sale #",
      cell: (sale) => <div className="font-medium">{sale.sale_number}</div>,
    },
    {
      key: "customer",
      header: "Customer",
      cell: (sale) => (
        <div>
          <div className="font-medium">
            {sale.customers?.first_name} {sale.customers?.last_name}
          </div>
          {sale.customers?.phone && (
            <div className="text-sm text-muted-foreground">{sale.customers.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      cell: (sale) => <div className="font-medium">{getTotalItems(sale.sale_items)} items</div>,
    },
    {
      key: "total",
      header: "Total",
      cell: (sale) => (
        <div>
          <div className="font-medium">
            <CurrencyDisplay amount={sale.total_amount} />
          </div>
          {parseFloat(sale.discount_amount) > 0 && (
            <div className="text-sm text-muted-foreground">
              -<CurrencyDisplay amount={sale.discount_amount} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: "payment",
      header: "Payment",
      cell: (sale) => {
        const paymentMethod = getPaymentMethodBadge(sale.payment_method)
        return <Badge variant={paymentMethod.variant}>{paymentMethod.label}</Badge>
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (sale) => {
        const paymentStatus = getPaymentStatusBadge(sale.payment_status)
        return <Badge variant={paymentStatus.variant}>{paymentStatus.label}</Badge>
      },
    },
    {
      key: "date",
      header: "Date",
      cell: (sale) => <div>{new Date(sale.sale_date).toLocaleDateString()}</div>,
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (sale) => <div className="text-sm text-muted-foreground">{new Date(sale.created_at).toLocaleDateString()}</div>,
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (sale) => (
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
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        data={sales}
        columns={columns}
        isLoading={isLoading}
        error={error || salesError}
        emptyMessage="No sales found"
        searchPlaceholder="Search sales..."
        searchValue={searchTerm}
        onSearch={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={handlePageChange}
        showSerialNumber
        serialOffset={(currentPage - 1) * ITEMS_PER_PAGE}
        filters={
          <div className="flex gap-2 flex-wrap">
            <MultiSelect
              options={[
                { value: "pending", label: "Pending" },
                { value: "paid", label: "Paid" },
                { value: "completed", label: "Completed" },
                { value: "failed", label: "Failed" },
                { value: "refunded", label: "Refunded" },
              ]}
              value={paymentStatuses}
              onValueChange={(v) => {
                setPaymentStatuses(v as Sale['payment_status'][])
                setCurrentPage(1)
              }}
              placeholder="All Status"
              className="h-10 w-[160px]"
              allLabel="All Status"
              showAllOption={true}
            />
            <MultiSelect
              options={[
                { value: "cash", label: "Cash" },
                { value: "card", label: "Card" },
                { value: "insurance", label: "Insurance" },
                { value: "fonepay", label: "Fonepay" },
                { value: "esewa", label: "eSewa" },
                { value: "khalti", label: "Khalti" },
                { value: "bank", label: "Bank Transfer" },
                { value: "mixed", label: "Mixed" },
                { value: "other", label: "Other" },
              ]}
              value={paymentMethods}
              onValueChange={(v) => {
                setPaymentMethods(v as Sale['payment_method'][])
                setCurrentPage(1)
              }}
              placeholder="All Methods"
              className="h-10 w-[160px]"
              allLabel="All Methods"
              showAllOption={true}
            />
          </div>
        }
        actions={
          <Button asChild>
            <Link href="/dashboard/sales/new">
              <Plus className="h-4 w-4 mr-2" />
              New Sale
            </Link>
          </Button>
        }
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
