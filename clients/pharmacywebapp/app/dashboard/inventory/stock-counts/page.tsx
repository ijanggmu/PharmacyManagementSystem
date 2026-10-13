"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ClipboardCheck, Plus } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingState } from "@/components/ui/loading-state"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { useCurrency } from "@/lib/contexts/currency-context"
import { formatNepalDateTime } from "@/lib/utils/nepal-time"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import { categoriesDotnetApi } from "@/lib/api/reference-api"
import { useSupplierOptions } from "@/features/suppliers/hooks/use-supplier-options"
import {
  stockCountKeys,
  stockCountsApi,
  type CreateStockCountInput,
  type StockCountListFilters,
} from "@/features/stock-counts/api-client"
import {
  STOCK_COUNT_STATUSES,
  stockCountStatusLabel,
  stockCountStatusVariant,
} from "@/features/stock-counts/lib/stock-count"

const PAGE_SIZE = 20

type Scope = "all" | "category" | "rack" | "supplier"

interface CreateArgs {
  input: CreateStockCountInput
  startNow: boolean
  key: string
}

/**
 * Stock → Stock counts: physical count sessions of the current branch. A count snapshots the system quantity of
 * every lot in scope, counters enter what is on the shelf, the variances are reviewed and posted as stock
 * gains / losses in one go.
 */
export default function StockCountsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<StockCountListFilters>({ page: 1, pageSize: PAGE_SIZE, status: "all" })
  const [createOpen, setCreateOpen] = useState(false)

  const list = useQuery({
    queryKey: stockCountKeys.list(filters),
    queryFn: () => stockCountsApi.list(filters),
    placeholderData: keepPreviousData,
  })

  const create = useMutation({
    mutationFn: async ({ input, startNow, key }: CreateArgs) => {
      const id = await stockCountsApi.create(input, key)
      if (startNow) await stockCountsApi.start(id)
      return id
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: stockCountKeys.all })
      setCreateOpen(false)
      router.push(`/dashboard/inventory/stock-counts/${id}`)
    },
    onError: (error) =>
      toast({ title: "Couldn't create the count", description: stockErrorMessage(error, "Try again."), variant: "destructive" }),
  })

  const page = filters.page ?? 1
  const rows = list.data?.items ?? []

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Stock counts"
          description="Count the shelves, review what's missing or extra, and post the differences to stock and the books."
          icon={ClipboardCheck}
          actions={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New count
            </Button>
          }
        />
        <Section spacing="lg">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Select
                value={filters.status ?? "all"}
                onValueChange={(status) => setFilters((f) => ({ ...f, status: status as StockCountListFilters["status"], page: 1 }))}
              >
                <SelectTrigger className="sm:w-56" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All counts</SelectItem>
                  {STOCK_COUNT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {stockCountStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {list.isLoading ? (
                <LoadingState text="Loading stock counts" />
              ) : list.isError ? (
                <ErrorState
                  message={stockErrorMessage(list.error, "Stock counts couldn't be loaded.")}
                  onRetry={() => void list.refetch()}
                  retrying={list.isFetching}
                />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={ClipboardCheck}
                  size="compact"
                  title="No stock counts yet"
                  description="Start a count for the whole branch, one rack, one category or one supplier's medicines."
                />
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Count</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Lots counted</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead className="text-right">Gain</TableHead>
                        <TableHead className="text-right">Loss</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Link className="font-medium hover:underline" href={`/dashboard/inventory/stock-counts/${row.id}`}>
                              {row.title}
                            </Link>
                            <div className="font-mono text-xs text-muted-foreground">
                              {row.sessionNumber}
                              {row.rackLocation ? ` · Rack ${row.rackLocation}` : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={stockCountStatusVariant(row.status)}>{stockCountStatusLabel(row.status)}</Badge>
                          </TableCell>
                          <TableCell className="num text-right">
                            {row.countedLineCount} / {row.lineCount}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.snapshotAtUtc ? formatNepalDateTime(row.snapshotAtUtc) : "Not started"}
                          </TableCell>
                          <TableCell className="num text-right">
                            {row.status === "Posted" ? formatCurrency(row.postedGainValue) : "—"}
                          </TableCell>
                          <TableCell className="num text-right">
                            {row.status === "Posted" ? formatCurrency(row.postedLossValue) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {list.data && list.data.totalPages > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={list.data.totalPages}
                  totalItems={list.data.totalCount}
                  itemsPerPage={PAGE_SIZE}
                  startIndex={(page - 1) * PAGE_SIZE}
                  onPageChange={(next) => setFilters((f) => ({ ...f, page: next }))}
                />
              )}
            </CardContent>
          </Card>
        </Section>

        <CreateCountDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          submitting={create.isPending}
          onSubmit={(args) => create.mutate(args)}
        />
      </PageContainer>
    </DashboardLayout>
  )
}

function CreateCountDialog({
  open,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  submitting: boolean
  onSubmit: (args: CreateArgs) => void
}) {
  const [title, setTitle] = useState("")
  const [scope, setScope] = useState<Scope>("all")
  const [categoryId, setCategoryId] = useState("")
  const [rack, setRack] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [notes, setNotes] = useState("")
  const keys = useRef(createIdempotencyKeyTracker())

  const categories = useQuery({
    queryKey: ["reference", "categories", "all"],
    queryFn: () => categoriesDotnetApi.list(),
    enabled: open && scope === "category",
    staleTime: 5 * 60 * 1000,
  })
  const suppliers = useSupplierOptions({ enabled: open && scope === "supplier" })

  const scopeMissing =
    (scope === "category" && !categoryId) || (scope === "rack" && !rack.trim()) || (scope === "supplier" && !supplierId)

  const submit = (startNow: boolean) => {
    const input: CreateStockCountInput = {
      title: title.trim() || null,
      categoryId: scope === "category" ? categoryId : null,
      rackLocation: scope === "rack" ? rack.trim() : null,
      supplierId: scope === "supplier" ? supplierId : null,
      notes: notes.trim() || null,
    }
    onSubmit({ input, startNow, key: keys.current.keyFor(JSON.stringify(input)) })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New stock count</DialogTitle>
          <DialogDescription>
            Starting the count records what the system says each lot holds. Sales during the count are allowed — they are
            taken into account, not booked as losses.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="count-title">Name</Label>
            <Input id="count-title" placeholder="e.g. Month-end count" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={128} />
          </div>
          <div className="space-y-1.5">
            <Label>What to count</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger aria-label="What to count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every lot at this branch</SelectItem>
                <SelectItem value="rack">One rack</SelectItem>
                <SelectItem value="category">One category</SelectItem>
                <SelectItem value="supplier">One supplier&apos;s medicines</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "rack" && (
            <div className="space-y-1.5">
              <Label htmlFor="count-rack">Rack</Label>
              <Input id="count-rack" placeholder="e.g. A1" value={rack} onChange={(e) => setRack(e.target.value)} maxLength={64} />
            </div>
          )}
          {scope === "category" && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger aria-label="Category">
                  <SelectValue placeholder={categories.isLoading ? "Loading…" : "Choose a category"} />
                </SelectTrigger>
                <SelectContent>
                  {(categories.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === "supplier" && (
            <div className="space-y-1.5">
              <Label>Preferred supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger aria-label="Supplier">
                  <SelectValue placeholder={suppliers.isLoading ? "Loading…" : "Choose a supplier"} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.options.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="count-notes">Notes (optional)</Label>
            <Textarea id="count-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1024} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={submitting || scopeMissing} onClick={() => submit(false)}>
            Save as draft
          </Button>
          <Button disabled={submitting || scopeMissing} loading={submitting} loadingText="Starting…" onClick={() => submit(true)}>
            Start counting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
