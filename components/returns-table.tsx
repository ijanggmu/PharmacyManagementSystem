"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MoreHorizontal, Eye, RotateCcw, Search, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Pagination } from "@/components/ui/pagination"
import { CurrencyDisplay } from "@/components/currency-display"
import { useReturns, useDeleteReturn, useUpdateReturnStatus } from "@/lib/hooks/use-returns"
import { Return, ReturnsFilters } from "@/lib/api/returns"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
// import ReturnDetailModal from "./return-detail-modal"
// import NewReturnForm from "./new-return-form"

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
  const [isNewReturnModalOpen, setIsNewReturnModalOpen] = useState(false)
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
  const { data: returnsResponse, isLoading, error } = useReturns(combinedFilters)
  const deleteReturnMutation = useDeleteReturn()
  const updateStatusMutation = useUpdateReturnStatus()

  const returns = returnsResponse?.data || []
  const returnsError = returnsResponse?.error

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
                placeholder="Search returns..."
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
            New Return
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">Loading returns...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error || returnsError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search returns..."
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
            New Return
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <p className="text-red-500">Failed to load returns</p>
            <p className="text-sm text-gray-500 mt-1">
              {error?.message || returnsError || "Please try again later"}
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
            setStatusFilter(value as Return['status'] | "all")
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
        <Button onClick={() => setIsNewReturnModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Return
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return #</TableHead>
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
            {returns.map((returnRecord) => {
              const status = getStatusBadge(returnRecord.status)
              const totalItems = getTotalItems(returnRecord.return_items)

              return (
                <TableRow key={returnRecord.id}>
                  <TableCell>
                    <div className="font-medium">{returnRecord.return_number}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{returnRecord.sales?.sale_number}</div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {returnRecord.customers?.first_name} {returnRecord.customers?.last_name}
                      </div>
                      {returnRecord.customers?.phone && (
                        <div className="text-sm text-gray-500">{returnRecord.customers.phone}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{totalItems} items</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      <CurrencyDisplay amount={returnRecord.total_refund_amount} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>{new Date(returnRecord.return_date).toLocaleDateString()}</TableCell>
                  <TableCell>
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
        totalPages={Math.ceil(returns.length / ITEMS_PER_PAGE)}
        totalItems={returns.length}
        itemsPerPage={ITEMS_PER_PAGE}
        startIndex={(currentPage - 1) * ITEMS_PER_PAGE}
        onPageChange={handlePageChange}
      />

      {/* <ReturnDetailModal
        returnRecord={selectedReturn}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      <NewReturnForm
        isOpen={isNewReturnModalOpen}
        onClose={() => setIsNewReturnModalOpen(false)}
        onSuccess={handleUpdate}
      /> */}

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
