"use client"

import { useState } from "react"
import { useDebounce } from "@/lib/utils/performance"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MoreHorizontal, Eye, RotateCcw, CheckCircle2, Clock, XCircle, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { useCurrency } from "@/lib/contexts/currency-context"
import { DataTable, Column } from "@/components/ui/data-table"
import { CurrencyDisplay } from "@/components/currency-display"
import { useReturns, useDeleteReturn, useUpdateReturnStatus } from "@/features/returns/hooks/use-returns"
import { returnsApi, Return, ReturnsFilters } from "@/features/returns/api-client"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import CreateReturnModal from "./create-return-modal"
import { useBranchNames } from "@/features/branches/components/branch-filter"
// import ReturnDetailModal from "./return-detail-modal"

interface ReturnsTableProps {
  filters?: ReturnsFilters
}

const ITEMS_PER_PAGE = 10

const SORT_OPTIONS: { value: string; label: string; sortBy: string; sortOrder: "asc" | "desc" }[] = [
  { value: "return_date:desc", label: "Newest first", sortBy: "return_date", sortOrder: "desc" },
  { value: "return_date:asc", label: "Oldest first", sortBy: "return_date", sortOrder: "asc" },
  { value: "total_return_amount:desc", label: "Highest amount", sortBy: "total_return_amount", sortOrder: "desc" },
  { value: "total_return_amount:asc", label: "Lowest amount", sortBy: "total_return_amount", sortOrder: "asc" },
  { value: "status:asc", label: "Status", sortBy: "status", sortOrder: "asc" },
]
const DEFAULT_SORT = SORT_OPTIONS[0].value
/** The API caps a page at 200 rows; exports page through up to this many. */
const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_ROWS = 5000

export default function ReturnsTable({ filters }: ReturnsTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<Return['status'] | "all">("all")
  const [sort, setSort] = useState(DEFAULT_SORT)
  // Typing only hits the API once the input settles.
  const debouncedSearch = useDebounce(searchTerm.trim(), 350)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [returnToDelete, setReturnToDelete] = useState<Return | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Return | null>(null)
  const { formatCurrency } = useCurrency()

  // Combine local filters with props filters
  const combinedFilters: ReturnsFilters = {
    ...filters,
    search: debouncedSearch || undefined,
    sortBy: (SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0]).sortBy,
    sortOrder: (SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0]).sortOrder,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch returns
  const { data: returnsResponse, isLoading, isFetching, error, refetch } = useReturns(combinedFilters)
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
        return { label: "Pending", variant: "warning" as const, icon: Clock }
      case "approved":
        return { label: "Approved", variant: "info" as const, icon: CheckCircle2 }
      case "rejected":
        return { label: "Rejected", variant: "danger" as const, icon: XCircle }
      case "completed":
        return { label: "Completed", variant: "success" as const, icon: CheckCircle2 }
      default:
        return { label: status ?? "Unknown", variant: "muted" as const, icon: Clock }
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

  const customerName = (r: Return) =>
    r.customers ? `${r.customers.first_name} ${r.customers.last_name}`.trim() : ""
  const hasFilters = searchTerm.length > 0 || statusFilter !== "all"
  const loadError = error || returnsError

  // Define columns
  // Rows span branches only when no branch is selected; then each row names its branch.
  const { branchName, multiBranch, canViewAll } = useBranchNames()
  const showBranchColumn = canViewAll && multiBranch && !filters?.branchId
  const columns: Column<Return>[] = [
    {
      key: "returnNumber",
      header: "Return #",
      cell: (returnRecord) => <div className="num font-medium">{returnRecord.return_number}</div>,
      exportValue: (returnRecord) => returnRecord.return_number,
    },
    {
      key: "saleNumber",
      header: "Sale #",
      cell: (returnRecord) => <div className="num">{returnRecord.sales?.sale_number ?? "—"}</div>,
      exportValue: (returnRecord) => returnRecord.sales?.sale_number ?? "",
    },
    {
      key: "customer",
      header: "Customer",
      cell: (returnRecord) => (
        <div className="min-w-0 max-w-[200px]">
          <div className="truncate font-medium" title={customerName(returnRecord) || undefined}>
            {customerName(returnRecord) || <span className="text-muted-foreground">Walk-in</span>}
          </div>
          {returnRecord.customers?.phone && (
            <div className="num text-xs text-muted-foreground">{returnRecord.customers.phone}</div>
          )}
        </div>
      ),
      exportValue: (returnRecord) =>
        returnRecord.customers ? `${returnRecord.customers.first_name} ${returnRecord.customers.last_name}` : "",
    },
    {
      key: "items",
      header: "Units",
      className: "text-right",
      cell: (returnRecord) => <div className="num">{getTotalItems(returnRecord.return_items)}</div>,
      exportValue: (returnRecord) => getTotalItems(returnRecord.return_items),
    },
    {
      key: "amount",
      header: "Return value",
      className: "text-right",
      cell: (returnRecord) => (
        <div className="num font-medium">
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
        const StatusIcon = status.icon
        return (
          <Badge variant={status.variant}>
            <StatusIcon aria-hidden />
            {status.label}
          </Badge>
        )
      },
      exportValue: (returnRecord) => getStatusBadge(returnRecord.status).label,
    },
    ...(showBranchColumn
      ? [
          {
            key: "branch",
            header: "Branch",
            cell: (row: Return) => <span className="whitespace-nowrap text-sm">{branchName(row.branch_id)}</span>,
            exportValue: (row: Return) => branchName(row.branch_id),
          } satisfies Column<Return>,
        ]
      : []),
    {
      key: "date",
      header: "Date",
      cell: (returnRecord) => <div className="num whitespace-nowrap">{new Date(returnRecord.return_date).toLocaleDateString()}</div>,
      exportValue: (returnRecord) => new Date(returnRecord.return_date).toLocaleDateString(),
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (returnRecord) => <div className="num whitespace-nowrap text-sm text-muted-foreground">{new Date(returnRecord.created_at).toLocaleDateString()}</div>,
      exportValue: (returnRecord) => new Date(returnRecord.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (returnRecord) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for return ${returnRecord.return_number}`}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(returnRecord)}>
              <Eye className="h-4 w-4 mr-2" aria-hidden />
              View details
            </DropdownMenuItem>
            {returnRecord.status === "pending" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleStatusChange(returnRecord, "approved")}>
                  <CheckCircle2 className="h-4 w-4 mr-2 text-success" aria-hidden />
                  Approve return
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setRejectTarget(returnRecord)}
                >
                  <XCircle className="h-4 w-4 mr-2" aria-hidden />
                  Reject return…
                </DropdownMenuItem>
              </>
            )}
            {returnRecord.status === "approved" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleStatusChange(returnRecord, "completed")}>
                  <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden />
                  Mark as completed
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleDeleteClick(returnRecord)}
            >
              <Trash2 className="h-4 w-4 mr-2" aria-hidden />
              Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {loadError && !isLoading ? (
        <ErrorState
          title="We couldn't load returns"
          message={`${typeof loadError === "string" ? loadError : loadError.message || "The server didn't respond."} Check your connection and try again.`}
          onRetry={() => void refetch()}
          retrying={isFetching}
          size="compact"
        />
      ) : (
      <DataTable
        data={returns}
        columns={columns}
        isLoading={isLoading}
        error={null}
        emptyMessage="No returns found"
        emptyState={
          hasFilters ? (
            <EmptyState
              icon={RotateCcw}
              title="No returns match your filters"
              description="Try a different search term or set the status filter back to all."
              action={{
                label: "Clear filters",
                onClick: () => {
                  setSearchTerm("")
                  setStatusFilter("all")
                  setCurrentPage(1)
                },
              }}
              size="compact"
            />
          ) : (
            <EmptyState
              icon={RotateCcw}
              title="No customer returns yet"
              description="When a customer brings medicine back, open the sale in Sales and choose Process return. It will show up here."
              action={{ label: "Go to sales", href: "/dashboard/sales" }}
              size="compact"
            />
          )
        }
        searchPlaceholder="Search return, invoice, customer or reason…"
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
          const rows: Return[] = []
          for (let page = 1; rows.length < EXPORT_MAX_ROWS; page++) {
            const res = await returnsApi.getReturns({ ...combinedFilters, page, limit: EXPORT_PAGE_SIZE })
            if (res.error) throw new Error(res.error)
            const batch = res.data || []
            rows.push(...batch)
            if (batch.length < EXPORT_PAGE_SIZE || rows.length >= (res.total ?? 0)) break
          }
          return rows.slice(0, EXPORT_MAX_ROWS)
        }}
        filters={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as Return['status'] | "all")
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={(value) => {
                setSort(value)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-[190px]" aria-label="Sort returns">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      )}

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
        title="Delete return?"
        description={`Return ${returnToDelete?.return_number ?? ""} will be permanently deleted. This can't be undone.`}
        confirmText="Delete return"
        cancelText="Cancel"
        variant="destructive"
      />

      <ConfirmDialog
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          const target = rejectTarget
          setRejectTarget(null)
          if (target) void handleStatusChange(target, "rejected")
        }}
        title="Reject this return?"
        description={
          rejectTarget
            ? `Return ${rejectTarget.return_number} (${formatCurrency(rejectTarget.total_return_amount)}) will be marked as rejected.`
            : ""
        }
        confirmText="Reject return"
        cancelText="Keep pending"
        variant="destructive"
      />
    </div>
  )
}
