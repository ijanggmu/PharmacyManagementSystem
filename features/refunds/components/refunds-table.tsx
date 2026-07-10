"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MoreHorizontal, Eye, DollarSign } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { CurrencyDisplay } from "@/components/currency-display"
import { useRefunds, useDeleteRefund, useUpdateRefundStatus } from "@/features/refunds/hooks/use-refunds"
import { RefundsFilters } from "@/features/refunds/api-client"
import { Refund } from "@/features/refunds/api-client"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import CreateRefundModal from "./create-refund-modal"
// import RefundDetailModal from "./refund-detail-modal"

interface RefundsTableProps {
  filters?: RefundsFilters
}

const ITEMS_PER_PAGE = 10

export default function RefundsTable({ filters }: RefundsTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<Refund['status'] | "all">("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [refundToDelete, setRefundToDelete] = useState<Refund | null>(null)

  // Combine local filters with props filters
  const combinedFilters: RefundsFilters = {
    ...filters,
    search: searchTerm || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch refunds
  const { data: refundsResponse, isLoading, error, refetch } = useRefunds(combinedFilters)
  const deleteRefundMutation = useDeleteRefund()
  const updateStatusMutation = useUpdateRefundStatus()

  const refunds = refundsResponse?.data || []
  const refundsError = refundsResponse?.error
  const totalCount = refundsResponse?.total ?? refunds.length

  // Server-side pagination - API handles pagination
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  const getStatusBadge = (status: Refund['status']) => {
    switch (status) {
      case "pending":
        return { label: "Pending", variant: "secondary" as const }
      case "approved":
        return { label: "Approved", variant: "default" as const }
      case "rejected":
        return { label: "Rejected", variant: "destructive" as const }
      case "completed":
        return { label: "Completed", variant: "outline" as const }
      default:
        return { label: status, variant: "secondary" as const }
    }
  }

  const getTotalItems = (items: Refund['refund_items']) => {
    return items.reduce((sum, item) => sum + item.quantity_refunded, 0)
  }

  const handleViewDetails = (refund: Refund) => {
    setSelectedRefund(refund)
    setIsDetailModalOpen(true)
  }

  const handleStatusChange = async (refund: Refund, newStatus: Refund['status']) => {
    if (!newStatus) return
    try {
      await updateStatusMutation.mutateAsync({ id: refund.id, status: newStatus })
    } catch (error) {
      console.error("Failed to update refund status:", error)
    }
  }

  const handleDeleteClick = (refund: Refund) => {
    setRefundToDelete(refund)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!refundToDelete) return

    // Store the refund before clearing state
    const refund = refundToDelete

    // Close dialog immediately to prevent UI freezing
    setIsDeleteDialogOpen(false)
    setRefundToDelete(null)

    try {
      // Execute the delete mutation
      deleteRefundMutation.mutate(refund.id)
    } catch (error) {
      // Fallback error handling
      console.error("Delete operation failed:", error)
    }
  }

  const handleUpdate = () => {
    void refetch()
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Define columns
  const columns: Column<Refund>[] = [
    {
      key: "refundNumber",
      header: "Refund #",
      cell: (refund) => <div className="font-medium">{refund.refund_number}</div>,
    },
    {
      key: "saleNumber",
      header: "Sale / Invoice",
      cell: (refund) => (
        <div>
          <div className="font-medium">{refund.sales?.sale_number}</div>
          {refund.sales?.invoice_number && (
            <div className="text-muted-foreground font-mono text-xs">{refund.sales.invoice_number}</div>
          )}
        </div>
      ),
    },
    {
      key: "creditNote",
      header: "Credit note",
      cell: (refund) => (
        <div className="font-mono text-sm">{refund.credit_note_number || "—"}</div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (refund) => (
        <div>
          <div className="font-medium">
            {refund.customers?.first_name} {refund.customers?.last_name}
          </div>
          {refund.customers?.phone && (
            <div className="text-sm text-gray-500">{refund.customers.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      cell: (refund) => <div className="font-medium">{getTotalItems(refund.refund_items)} items</div>,
    },
    {
      key: "amount",
      header: "Refund Amount",
      cell: (refund) => (
        <div className="font-medium">
          <CurrencyDisplay amount={refund.total_refund_amount || refund.net_refund_amount || "0"} />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (refund) => {
        const status = getStatusBadge(refund.status)
        return <Badge variant={status.variant}>{status.label}</Badge>
      },
    },
    {
      key: "date",
      header: "Date",
      cell: (refund) => <div>{new Date(refund.refund_date).toLocaleDateString()}</div>,
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (refund) => <div className="text-sm text-muted-foreground">{new Date(refund.created_at).toLocaleDateString()}</div>,
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (refund) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(refund)}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            {refund.status === "pending" && (
              <>
                <DropdownMenuItem onClick={() => handleStatusChange(refund, "approved")}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Approve Refund
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange(refund, "rejected")}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Reject Refund
                </DropdownMenuItem>
              </>
            )}
            {refund.status === "approved" && (
              <DropdownMenuItem onClick={() => handleStatusChange(refund, "completed")}>
                <DollarSign className="h-4 w-4 mr-2" />
                Mark as Completed
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteClick(refund)}>
              <DollarSign className="h-4 w-4 mr-2" />
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
        data={refunds}
        columns={columns}
        isLoading={isLoading}
        error={error || refundsError}
        emptyMessage="No refunds found"
        searchPlaceholder="Search refunds..."
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
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as Refund['status'] | "all")
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        }
        actions={
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <DollarSign className="h-4 w-4 mr-2" />
            New Refund
          </Button>
        }
      />

      <CreateRefundModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleUpdate}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setRefundToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Refund"
        description={`Are you sure you want to delete refund ${refundToDelete?.refund_number}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}
