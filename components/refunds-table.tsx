"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MoreHorizontal, Eye, DollarSign, Search, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Pagination } from "@/components/ui/pagination"
import { CurrencyDisplay } from "@/components/currency-display"
import { useRefunds, useDeleteRefund, useUpdateRefundStatus } from "@/lib/hooks/use-refunds"
import { RefundsFilters } from "@/lib/api/refunds"
import { Refund } from "@/lib/api/refunds"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
// import RefundDetailModal from "./refund-detail-modal"
// import NewRefundForm from "./new-refund-form"

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
  const [isNewRefundModalOpen, setIsNewRefundModalOpen] = useState(false)
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
  const { data: refundsResponse, isLoading, error } = useRefunds(combinedFilters)
  const deleteRefundMutation = useDeleteRefund()
  const updateStatusMutation = useUpdateRefundStatus()

  const refunds = refundsResponse?.data || []
  const refundsError = refundsResponse?.error

  // Server-side pagination - API handles pagination
  const totalPages = Math.ceil(refunds.length / ITEMS_PER_PAGE) // This would ideally come from API with total count
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE

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
                placeholder="Search refunds..."
                disabled
                className="pl-10"
              />
            </div>
            <Select disabled value="all">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
            </Select>
          </div>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            New Refund
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">Loading refunds...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error || refundsError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search refunds..."
                disabled
                className="pl-10"
              />
            </div>
            <Select disabled value="all">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
            </Select>
          </div>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            New Refund
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <p className="text-red-500">Failed to load refunds</p>
            <p className="text-sm text-gray-500 mt-1">
              {error?.message || refundsError || "Please try again later"}
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
              placeholder="Search refunds..."
              value={searchTerm || ""}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => {
            setStatusFilter(value as Refund['status'] | "all")
            setCurrentPage(1)
          }}>
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
        </div>
        <Button onClick={() => setIsNewRefundModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Refund
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Refund #</TableHead>
              <TableHead>Sale #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Refund Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {refunds.map((refund) => {
              const status = getStatusBadge(refund.status)
              const totalItems = getTotalItems(refund.refund_items)

              return (
                <TableRow key={refund.id}>
                  <TableCell>
                    <div className="font-medium">{refund.refund_number}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{refund.sales?.sale_number}</div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {refund.customers?.first_name} {refund.customers?.last_name}
                      </div>
                      {refund.customers?.phone && (
                        <div className="text-sm text-gray-500">{refund.customers.phone}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{totalItems} items</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      <CurrencyDisplay amount={refund.total_refund_amount || refund.net_refund_amount || "0"} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>{new Date(refund.refund_date).toLocaleDateString()}</TableCell>
                  <TableCell>
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
        totalItems={refunds.length}
        itemsPerPage={ITEMS_PER_PAGE}
        startIndex={startIndex}
        onPageChange={handlePageChange}
      />

      {/* <RefundDetailModal
        refund={selectedRefund}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      <NewRefundForm
        isOpen={isNewRefundModalOpen}
        onClose={() => setIsNewRefundModalOpen(false)}
        onSuccess={handleUpdate}
      /> */}

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
