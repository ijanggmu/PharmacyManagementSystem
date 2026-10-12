"use client"

import { useState } from "react"
import { useDebounce } from "@/lib/utils/performance"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MoreHorizontal, Eye, CheckCircle2, Clock, XCircle, Trash2, Plus, RefreshCw,
  Printer } from "lucide-react"
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
import { useRefunds, useDeleteRefund, useUpdateRefundStatus } from "@/features/refunds/hooks/use-refunds"
import { refundsApi, RefundsFilters } from "@/features/refunds/api-client"
import { Refund } from "@/features/refunds/api-client"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CreditNotePrintDialog } from "./credit-note-print-dialog"
import CreateRefundModal from "./create-refund-modal"
import { useBranchNames } from "@/features/branches/components/branch-filter"
import { RefundDetailSheet } from "./refund-detail-sheet"

interface RefundsTableProps {
  filters?: RefundsFilters
  /**
   * Optional control of the "New refund" modal, so a page header can own the
   * primary action. When omitted the table manages the modal itself.
   */
  isCreateOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
  /** Hide the toolbar "New refund" button (e.g. when the page header shows one). */
  hideCreateAction?: boolean
}

const ITEMS_PER_PAGE = 10

const SORT_OPTIONS: { value: string; label: string; sortBy: string; sortOrder: "asc" | "desc" }[] = [
  { value: "refund_date:desc", label: "Newest first", sortBy: "refund_date", sortOrder: "desc" },
  { value: "refund_date:asc", label: "Oldest first", sortBy: "refund_date", sortOrder: "asc" },
  { value: "net_refund_amount:desc", label: "Highest amount", sortBy: "net_refund_amount", sortOrder: "desc" },
  { value: "net_refund_amount:asc", label: "Lowest amount", sortBy: "net_refund_amount", sortOrder: "asc" },
  { value: "refund_number:desc", label: "Refund no. (newest)", sortBy: "refund_number", sortOrder: "desc" },
]
const DEFAULT_SORT = SORT_OPTIONS[0].value
/** The API caps a page at 200 rows; exports page through up to this many. */
const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_ROWS = 5000

export default function RefundsTable({
  filters,
  isCreateOpen,
  onCreateOpenChange,
  hideCreateAction = false,
}: RefundsTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<Refund['status'] | "all">("all")
  const [sort, setSort] = useState(DEFAULT_SORT)
  // Typing only hits the API once the input settles.
  const debouncedSearch = useDebounce(searchTerm.trim(), 350)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null)
  const [localCreateOpen, setLocalCreateOpen] = useState(false)
  const isCreateModalOpen = isCreateOpen ?? localCreateOpen
  const setIsCreateModalOpen = (open: boolean) => {
    if (onCreateOpenChange) onCreateOpenChange(open)
    else setLocalCreateOpen(open)
  }
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [creditNoteRefundId, setCreditNoteRefundId] = useState<string | null>(null)
  const [refundToDelete, setRefundToDelete] = useState<Refund | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Refund | null>(null)
  const { formatCurrency } = useCurrency()

  // Combine local filters with props filters
  const combinedFilters: RefundsFilters = {
    ...filters,
    search: debouncedSearch || undefined,
    sortBy: (SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0]).sortBy,
    sortOrder: (SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0]).sortOrder,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch refunds
  const { data: refundsResponse, isLoading, isFetching, error, refetch } = useRefunds(combinedFilters)
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

  const getTotalItems = (items: Refund['refund_items']) => {
    return items.reduce((sum, item) => sum + item.quantity_refunded, 0)
  }

  const handleViewDetails = (refund: Refund) => {
    setSelectedRefund(refund)
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

  const customerName = (r: Refund) =>
    r.customers ? `${r.customers.first_name} ${r.customers.last_name}`.trim() : ""
  const refundAmount = (r: Refund) => r.total_refund_amount || r.net_refund_amount || "0"
  const hasFilters = searchTerm.length > 0 || statusFilter !== "all"
  const loadError = error || refundsError

  // Define columns
  // Rows span branches only when no branch is selected; then each row names its branch.
  const { branchName, multiBranch, canViewAll } = useBranchNames()
  const showBranchColumn = canViewAll && multiBranch && !filters?.branchId
  const columns: Column<Refund>[] = [
    {
      key: "refundNumber",
      header: "Refund #",
      cell: (refund) => <div className="num font-medium">{refund.refund_number}</div>,
      exportValue: (refund) => refund.refund_number,
    },
    {
      key: "saleNumber",
      header: "Sale / Invoice",
      cell: (refund) => (
        <div>
          <div className="num">{refund.sales?.sale_number ?? "—"}</div>
          {refund.sales?.invoice_number && (
            <div className="text-muted-foreground font-mono text-xs">{refund.sales.invoice_number}</div>
          )}
        </div>
      ),
      exportValue: (refund) => refund.sales?.sale_number ?? "",
    },
    {
      key: "creditNote",
      header: "Credit note",
      cell: (refund) => (
        // Assigned when the refund completes; pending refunds have none yet.
        <div className="font-mono text-sm">{refund.credit_note_number || (refund.status === "pending" || refund.status === "approved" ? "On completion" : "—")}</div>
      ),
      exportValue: (refund) => refund.credit_note_number || "",
    },
    {
      key: "customer",
      header: "Customer",
      cell: (refund) => (
        <div className="min-w-0 max-w-[200px]">
          <div className="truncate font-medium" title={customerName(refund) || undefined}>
            {customerName(refund) || <span className="text-muted-foreground">—</span>}
          </div>
          {refund.customers?.phone && (
            <div className="num text-xs text-muted-foreground">{refund.customers.phone}</div>
          )}
        </div>
      ),
      exportValue: (refund) => (refund.customers ? `${refund.customers.first_name} ${refund.customers.last_name}` : ""),
    },
    {
      key: "items",
      header: "Units",
      className: "text-right",
      cell: (refund) => <div className="num">{getTotalItems(refund.refund_items)}</div>,
      exportValue: (refund) => getTotalItems(refund.refund_items),
    },
    {
      key: "amount",
      header: "Refund amount",
      className: "text-right",
      cell: (refund) => (
        <div className="num font-medium">
          <CurrencyDisplay amount={refundAmount(refund)} />
        </div>
      ),
      exportValue: (refund) => refund.total_refund_amount || refund.net_refund_amount || "0",
    },
    {
      key: "status",
      header: "Status",
      cell: (refund) => {
        const status = getStatusBadge(refund.status)
        const StatusIcon = status.icon
        return (
          <Badge variant={status.variant}>
            <StatusIcon aria-hidden />
            {status.label}
          </Badge>
        )
      },
      exportValue: (refund) => getStatusBadge(refund.status).label ?? "",
    },
    ...(showBranchColumn
      ? [
          {
            key: "branch",
            header: "Branch",
            cell: (row: Refund) => <span className="whitespace-nowrap text-sm">{branchName(row.branch_id)}</span>,
            exportValue: (row: Refund) => branchName(row.branch_id),
          } satisfies Column<Refund>,
        ]
      : []),
    {
      key: "date",
      header: "Date",
      cell: (refund) => <div className="num whitespace-nowrap">{new Date(refund.refund_date).toLocaleDateString()}</div>,
      exportValue: (refund) => new Date(refund.refund_date).toLocaleDateString(),
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (refund) => <div className="num whitespace-nowrap text-sm text-muted-foreground">{new Date(refund.created_at).toLocaleDateString()}</div>,
      exportValue: (refund) => new Date(refund.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (refund) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for refund ${refund.refund_number}`}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(refund)}>
              <Eye className="h-4 w-4 mr-2" aria-hidden />
              View details
            </DropdownMenuItem>
            {refund.credit_note_number && refund.status !== "rejected" && (
              <DropdownMenuItem onClick={() => setCreditNoteRefundId(refund.id)}>
                <Printer className="h-4 w-4 mr-2" aria-hidden />
                Print credit note
              </DropdownMenuItem>
            )}
            {refund.status === "pending" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleStatusChange(refund, "approved")}>
                  <CheckCircle2 className="h-4 w-4 mr-2 text-success" aria-hidden />
                  Approve refund
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setRejectTarget(refund)}
                >
                  <XCircle className="h-4 w-4 mr-2" aria-hidden />
                  Reject refund…
                </DropdownMenuItem>
              </>
            )}
            {refund.status === "approved" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleStatusChange(refund, "completed")}>
                  <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden />
                  Mark as completed
                </DropdownMenuItem>
              </>
            )}
            {/* A completed refund is posted to accounting and on an IRD credit note: it stays. Only an
                unposted refund can be discarded. */}
            {refund.status !== "completed" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDeleteClick(refund)}
                >
                  <Trash2 className="h-4 w-4 mr-2" aria-hidden />
                  Discard…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {loadError && !isLoading ? (
        <ErrorState
          title="We couldn't load refunds"
          message={`${typeof loadError === "string" ? loadError : loadError.message || "The server didn't respond."} Check your connection and try again.`}
          onRetry={() => void refetch()}
          retrying={isFetching}
          size="compact"
        />
      ) : (
      <DataTable
        data={refunds}
        columns={columns}
        isLoading={isLoading}
        error={null}
        emptyMessage="No refunds found"
        emptyState={
          hasFilters ? (
            <EmptyState
              icon={RefreshCw}
              title="No refunds match your filters"
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
              icon={RefreshCw}
              title="No refunds yet"
              description="Create a refund when a customer should get money back for a paid sale.."
              action={{ label: "New refund", onClick: () => setIsCreateModalOpen(true), icon: Plus }}
              size="compact"
            />
          )
        }
        searchPlaceholder="Search refund no., invoice, customer or reason…"
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
        exportFilename="refunds"
        exportTitle="Refunds"
        onExportAll={async () => {
          const rows: Refund[] = []
          for (let page = 1; rows.length < EXPORT_MAX_ROWS; page++) {
            const res = await refundsApi.getRefunds({ ...combinedFilters, page, limit: EXPORT_PAGE_SIZE })
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
                setStatusFilter(value as Refund['status'] | "all")
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
              <SelectTrigger className="w-full sm:w-[190px]" aria-label="Sort refunds">
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
        actions={
          hideCreateAction ? undefined : (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New refund
            </Button>
          )
        }
      />
      )}

      <CreateRefundModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleUpdate}
      />

      <CreditNotePrintDialog
        refundId={creditNoteRefundId}
        open={creditNoteRefundId !== null}
        onClose={() => setCreditNoteRefundId(null)}
      />

      <RefundDetailSheet
        refund={selectedRefund}
        onOpenChange={(open) => !open && setSelectedRefund(null)}
        statusBadge={(status) => {
          const b = getStatusBadge(status)
          const Icon = b.icon
          return (
            <Badge variant={b.variant}>
              <Icon aria-hidden />
              {b.label}
            </Badge>
          )
        }}
        branchName={multiBranch ? branchName : undefined}
        onPrintCreditNote={(r) => setCreditNoteRefundId(r.id)}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setRefundToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Discard this refund?"
        description={`Refund ${refundToDelete?.refund_number ?? ""} hasn't been completed, so no money has been paid out or posted. Discarding removes it from the list.`}
        confirmText="Discard refund"
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
        title="Reject this refund?"
        description={
          rejectTarget
            ? `Refund ${rejectTarget.refund_number} for ${formatCurrency(refundAmount(rejectTarget))} will be marked as rejected and no money will be paid out.`
            : ""
        }
        confirmText="Reject refund"
        cancelText="Keep pending"
        variant="destructive"
      />
    </div>
  )
}
