"use client"

import { useMemo, useState } from "react"
import { ArrowLeftRight, Ban, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { withBranchNames, type StockTransfer } from "@/features/inventory/api-client-stock-transfers"
import { useStockTransfers } from "@/features/inventory/hooks/use-stock-transfers"
import { DualDate, TransferRoute, TransferStatusBadge } from "./transfer-parts"

type StatusFilter = "all" | StockTransfer["status"]

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_transit", label: "In transit" },
  { value: "completed", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
]

export function StockTransfersList({
  branches,
  inTransitCount,
  onOpen,
  onReceive,
  onCancel,
  receivingId,
}: {
  branches: ReadonlyArray<{ id: string; name: string; code: string }>
  inTransitCount: number | undefined
  onOpen: (transfer: StockTransfer) => void
  onReceive: (transfer: StockTransfer) => void
  onCancel: (transfer: StockTransfer) => void
  receivingId: string | null
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [status, setStatus] = useState<StatusFilter>("all")
  const [branchId, setBranchId] = useState<string>("all")
  const [search, setSearch] = useState("")

  const query = useStockTransfers({
    pageNumber: page,
    pageSize,
    status: status === "all" ? undefined : status,
    branchId: branchId === "all" ? undefined : branchId,
  })

  const rows = useMemo(() => {
    const named = (query.data?.data ?? []).map((t) => withBranchNames(t, branches))
    const term = search.trim().toLowerCase()
    if (!term) return named
    // The endpoint has no text search, so this narrows the current page only.
    return named.filter(
      (t) =>
        t.transfer_number.toLowerCase().includes(term) ||
        t.stock_transfer_items.some((i) => i.medicines?.name.toLowerCase().includes(term)),
    )
  }, [query.data, branches, search])

  const meta = query.data?.meta
  const filtered = status !== "all" || branchId !== "all"

  const columns: Column<StockTransfer>[] = [
    {
      key: "number",
      header: "Transfer",
      cell: (t) => <span className="font-mono text-xs">{t.transfer_number}</span>,
      exportValue: (t) => t.transfer_number,
    },
    {
      key: "route",
      header: "From → To",
      cell: (t) => <TransferRoute transfer={t} />,
      exportValue: (t) => `${t.from_branch?.name ?? ""} → ${t.to_branch?.name ?? ""}`,
    },
    {
      key: "items",
      header: "Medicines",
      cell: (t) => {
        const text = t.stock_transfer_items.map((i) => `${i.medicines?.name || "Medicine"} × ${i.quantity}`).join(", ")
        return (
          <span className="block max-w-[18rem] truncate text-sm text-muted-foreground" title={text}>
            {text}
          </span>
        )
      },
      exportValue: (t) => t.stock_transfer_items.map((i) => `${i.medicines?.name || "Medicine"} x ${i.quantity}`).join("; "),
    },
    {
      key: "units",
      header: "Units",
      className: "text-right",
      cell: (t) => <span className="num">{t.stock_transfer_items.reduce((s, i) => s + i.quantity, 0)}</span>,
      exportValue: (t) => t.stock_transfer_items.reduce((s, i) => s + i.quantity, 0),
    },
    {
      key: "status",
      header: "Status",
      cell: (t) => <TransferStatusBadge status={t.status} />,
      exportValue: (t) => t.status,
    },
    {
      key: "date",
      header: "Dispatched",
      cell: (t) => <DualDate utc={t.created_at} />,
      exportValue: (t) => t.created_at,
    },
    {
      key: "actions",
      header: "",
      className: "w-40 text-right",
      cell: (t) =>
        t.status === "in_transit" ? (
          // Stop the row click from also opening the details sheet.
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Button size="sm" onClick={() => onReceive(t)} loading={receivingId === t.id} loadingText="Receiving…">
              <PackageCheck aria-hidden />
              Receive
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Cancel transfer ${t.transfer_number}`}
              title="Cancel transfer"
              onClick={() => onCancel(t)}
            >
              <Ban className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null,
    },
  ]

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Filter by status" className="inline-flex rounded-md border bg-muted/40 p-0.5">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={status === option.value}
            onClick={() => {
              setStatus(option.value)
              setPage(1)
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              status === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.value === "in_transit" && inTransitCount ? (
              <span className="num rounded-full bg-info/15 px-1.5 text-xs text-info">{inTransitCount}</span>
            ) : null}
          </button>
        ))}
      </div>
      <Select
        value={branchId}
        onValueChange={(v) => {
          setBranchId(v)
          setPage(1)
        }}
      >
        <SelectTrigger className="h-9 w-[200px]" aria-label="Filter by branch (sent or received)">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All branches</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setStatus("all")
            setBranchId("all")
            setPage(1)
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  )

  return (
    <DataTable<StockTransfer>
      data={rows}
      columns={columns}
      isLoading={query.isLoading}
      error={query.error ? query.error.message : null}
      onRetry={() => void query.refetch()}
      showSearch
      searchValue={search}
      onSearch={setSearch}
      searchPlaceholder="Search this page by transfer no. or medicine…"
      filters={filters}
      currentPage={page}
      totalPages={Math.max(1, meta?.totalPages ?? 1)}
      totalItems={meta?.totalCount ?? 0}
      itemsPerPage={pageSize}
      onPageChange={setPage}
      onItemsPerPageChange={(size) => {
        setPageSize(size)
        setPage(1)
      }}
      onRowClick={onOpen}
      showSerialNumber
      serialOffset={(page - 1) * pageSize}
      enableExport
      exportFilename="stock-transfers"
      exportTitle="Stock transfers"
      emptyState={
        filtered || search ? (
          <EmptyState
            size="compact"
            icon={ArrowLeftRight}
            title="No transfers match these filters"
            description="Try another status or branch."
            action={{
              label: "Clear filters",
              onClick: () => {
                setStatus("all")
                setBranchId("all")
                setSearch("")
                setPage(1)
              },
            }}
          />
        ) : (
          <EmptyState
            size="compact"
            icon={ArrowLeftRight}
            title="No stock transfers yet"
            description="Open the New transfer tab to send stock from one branch to another."
          />
        )
      }
    />
  )
}
