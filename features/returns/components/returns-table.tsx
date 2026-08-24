"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MoreHorizontal, Eye, RotateCcw } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { CurrencyDisplay } from "@/components/currency-display"
import { useReturns, useDeleteReturn, useUpdateReturnStatus } from "@/features/returns/hooks/use-returns"
import { returnsApi, Return, ReturnsFilters } from "@/features/returns/api-client"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import CreateReturnModal from "./create-return-modal"
// import ReturnDetailModal from "./return-detail-modal"

interface ReturnsTableProps {
  filters?: ReturnsFilters
}

const ITEMS_PER_PAGE = 10

export default function ReturnsTable({ filters }: ReturnsTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<Return['status'] | "all">("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [returnToDelete, setReturnToDelete] = useState<Return | null>(null)

  // Combine local filters with props filters
  const combinedFilters: ReturnsFilters = {
    ...filters,
    search: searchTerm || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch returns
  const { data: returnsResponse, isLoading, error, refetch } = useReturns(combinedFilters)
  const deleteReturnMutation = useDeleteReturn()
  const updateStatusMutation = useUpdateReturnStatus()

  const returns = returnsResponse?.data || []
  const returnsError = returnsResponse?.error
  const totalCount = returnsResponse?.total ?? returns.length

  // Server-side pagination - API handles pagination
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  const getStatusBadge = (status: Return['status']) => {
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

  const getTotalItems = (items: Return['return_items']) => {
    return items.reduce((sum, item) => sum + item.quantity_returned, 0)
  }

  const handleViewDetails = (returnRecord: Return) => {
    setSelectedReturn(returnRecord)
    setIsDetailModalOpen(true)
  }

  const handleStatusChange = async (returnRecord: Return, newStatus: Return['status']) => {
    try {
      await updateStatusMutation.mutateAsync({ id: returnRecord.id, status: newStatus })
    } catch (error) {
      console.error("Failed to update return status:", error)
    }
  }

  const handleDeleteClick = (returnRecord: Return) => {
    setReturnToDelete(returnRecord)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!returnToDelete) return

    // Store the return before clearing state
    const returnRecord = returnToDelete

    // Close dialog immediately to prevent UI freezing
    setIsDeleteDialogOpen(false)
    setReturnToDelete(null)

    try {
      // Execute the delete mutation
      deleteReturnMutation.mutate(returnRecord.id)
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
  const columns: Column<Return>[] = [
    {
      key: "returnNumber",
      header: "Return #",
      cell: (returnRecord) => <div className="font-medium">{returnRecord.return_number}</div>,
      exportValue: (returnRecord) => returnRecord.return_number,
    },
    {
      key: "saleNumber",
      header: "Sale #",
      cell: (returnRecord) => <div className="font-medium">{returnRecord.sales?.sale_number}</div>,
      exportValue: (returnRecord) => returnRecord.sales?.sale_number ?? "",
    },
    {
      key: "customer",
      header: "Customer",
      cell: (returnRecord) => (
        <div>
          <div className="font-medium">
            {returnRecord.customers?.first_name} {returnRecord.customers?.last_name}
          </div>
          {returnRecord.customers?.phone && (
            <div className="text-sm text-gray-500">{returnRecord.customers.phone}</div>
          )}
        </div>
      ),
      exportValue: (returnRecord) =>
        returnRecord.customers ? `${returnRecord.customers.first_name} ${returnRecord.customers.last_name}` : "",
    },
    {
      key: "items",
      header: "Items",
      cell: (returnRecord) => (
        <div className="font-medium">{getTotalItems(returnRecord.return_items)} items</div>
      ),
      exportValue: (returnRecord) => getTotalItems(returnRecord.return_items),
    },
    {
      key: "amount",
      header: "Refund Amount",
      cell: (returnRecord) => (
        <div className="font-medium">
          <CurrencyDisplay amount={returnRecord.total_return_amount} />
        </div>
      ),
      exportValue: (returnRecord) => returnRecord.total_return_amount,
    },
    {
      key: "status",
      header: "Status",
      cell: (returnRecord) => {
        const status = getStatusBadge(returnRecord.status)
        return <Badge variant={status.variant}>{status.label}</Badge>
      },
      exportValue: (returnRecord) => getStatusBadge(returnRecord.status).label,
    },
    {
      key: "date",
      header: "Date",
      cell: (returnRecord) => <div>{new Date(returnRecord.return_date).toLocaleDateString()}</div>,
      exportValue: (returnRecord) => new Date(returnRecord.return_date).toLocaleDateString(),
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (returnRecord) => <div className="text-sm text-muted-foreground">{new Date(returnRecord.created_at).toLocaleDateString()}</div>,
      exportValue: (returnRecord) => new Date(returnRecord.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (returnRecord) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(returnRecord)}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            {returnRecord.status === "pending" && (
              <>
                <DropdownMenuItem onClick={() => handleStatusChange(returnRecord, "approved")}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Approve Return
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange(returnRecord, "rejected")}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reject Return
                </DropdownMenuItem>
              </>
            )}
            {returnRecord.status === "approved" && (
              <DropdownMenuItem onClick={() => handleStatusChange(returnRecord, "completed")}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Mark as Completed
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteClick(returnRecord)}>
              <RotateCcw className="h-4 w-4 mr-2" />
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
        data={returns}
        columns={columns}
        isLoading={isLoading}
        error={error || returnsError}
        emptyMessage="No returns found"
        searchPlaceholder="Search returns..."
        searchValue={searchTerm}
        onSearch={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={handlePageChange}
        showSerialNumber
        serialOffset={(currentPage - 1) * ITEMS_PER_PAGE}
        enableExport
        exportFilename="returns"
        exportTitle="Returns"
        onExportAll={async () => {
          const res = await returnsApi.getReturns({ ...combinedFilters, page: 1, limit: 5000 })
          return res.data || []
        }}
        filters={
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as Return['status'] | "all")
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
      />

      <CreateReturnModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleUpdate}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setReturnToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Return"
        description={`Are you sure you want to delete return ${returnToDelete?.return_number}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}
