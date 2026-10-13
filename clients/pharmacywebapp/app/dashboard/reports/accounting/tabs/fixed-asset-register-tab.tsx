"use client"

import { useMemo, useState } from "react"
import { Armchair, Download, Layers, Pencil, PackageMinus, PlusCircle, RefreshCw, Scale, Trash2, TrendingDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { DisposeFixedAssetDialog } from "@/features/accounting/components/dispose-fixed-asset-dialog"
import { FixedAssetFormDialog } from "@/features/accounting/components/fixed-asset-form-dialog"
import { useCanPostVouchers } from "@/features/accounting/hooks/use-account-permissions"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useFixedAssetMutations, useFixedAssets } from "@/features/accounting/hooks/use-fixed-assets"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import {
  METHOD_LABEL,
  REGISTER_CSV_HEADERS,
  registerCsvRows,
  registerTotals,
  type FixedAsset,
} from "@/features/accounting/lib/fixed-assets"
import { FetchingIndicator, QueryState, ScrollTable, SectionHeading, stickyFooterClass, stickyHeaderClass, totalsRowClass } from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

type StatusFilter = "active" | "disposed" | "all"

/**
 * Accounting › Fixed assets › Asset register: every asset with its cost, accumulated depreciation (opening + posted
 * months) and net book value. Add / edit / dispose / delete, and a CSV export of the register.
 */
export default function FixedAssetRegisterTab() {
  const { toast } = useToast()
  const { money, amount } = useAccountingMoney()
  const { branches } = useAccountingContext()
  const canPost = useCanPostVouchers()
  const register = useFixedAssets()
  const { remove } = useFixedAssetMutations()
  const [status, setStatus] = useState<StatusFilter>("active")
  const [search, setSearch] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FixedAsset | null>(null)
  const [disposing, setDisposing] = useState<FixedAsset | null>(null)
  const [deleting, setDeleting] = useState<FixedAsset | null>(null)

  const all = useMemo(() => register.data ?? [], [register.data])
  const totals = registerTotals(all)
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? null
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return all.filter(
      (a) =>
        (status === "all" || a.status === status) &&
        (!term || [a.name, a.category, a.asset_tag ?? "", a.location ?? ""].some((v) => v.toLowerCase().includes(term)))
    )
  }, [all, status, search])
  const shown = {
    cost: rows.reduce((s, a) => s + a.cost, 0),
    accumulated: rows.reduce((s, a) => s + a.accumulated_depreciation, 0),
    nbv: rows.reduce((s, a) => s + a.net_book_value, 0),
  }

  const confirmDelete = () => {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast({ title: "Asset deleted", description: `${deleting.name} — its acquisition voucher was reversed.` })
        setDeleting(null)
      },
      onError: (e) => toast({ title: "Couldn't delete the asset", description: apiRequestErrorMessage(e), variant: "destructive" }),
    })
  }

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard label="Assets in use" value={register.data ? totals.count : "—"} icon={Armchair} loading={register.isLoading} />
        <StatCard label="Cost" value={register.data ? money(totals.cost) : "—"} hint="Fixed Assets (1550)" icon={Layers} loading={register.isLoading} />
        <StatCard
          label="Accumulated depreciation"
          value={register.data ? money(totals.accumulated) : "—"}
          hint="Accumulated Depreciation (1590)"
          icon={TrendingDown}
          loading={register.isLoading}
        />
        <StatCard label="Net book value" value={register.data ? money(totals.nbv) : "—"} icon={Scale} tone="info" loading={register.isLoading} />
      </StatGrid>

      <Card className="gap-0 py-0">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <SectionHeading
            icon={Armchair}
            title="Asset register"
            description="Cost excludes the input VAT claimed. Depreciation is posted by the monthly runs on the Depreciation tab."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <FetchingIndicator active={register.isFetching && !register.isLoading} />
                {canPost && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(null)
                      setFormOpen(true)
                    }}
                  >
                    <PlusCircle aria-hidden />
                    Add asset
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("fixed-asset-register.csv", [...REGISTER_CSV_HEADERS], registerCsvRows(rows))}
                  disabled={rows.length === 0}
                >
                  <Download aria-hidden />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => void register.refetch()} aria-label="Refresh the register">
                  <RefreshCw aria-hidden />
                </Button>
              </div>
            }
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, category, tag or location"
              aria-label="Search assets"
              className="sm:max-w-xs"
            />
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-full sm:w-[160px]" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">In use</SelectItem>
                <SelectItem value="disposed">Disposed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <QueryState
            isLoading={register.isLoading}
            error={register.error}
            onRetry={() => void register.refetch()}
            retrying={register.isFetching}
            errorTitle="Couldn't load the asset register"
            isEmpty={rows.length === 0}
            empty={{
              icon: Armchair,
              title: all.length === 0 ? "No fixed assets yet" : "No assets match",
              description:
                all.length === 0
                  ? "Add the furniture, computers, fridges and vehicles the pharmacy owns — bought now, on a supplier bill, or owned before go-live."
                  : "Change the search or the status filter.",
            }}
          >
            <ScrollTable label="Fixed asset register">
              <TableHeader className={stickyHeaderClass}>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Acquired (BS)</TableHead>
                  <TableHead className="hidden lg:table-cell">Method</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Acc. depreciation</TableHead>
                  <TableHead className="text-right">Book value</TableHead>
                  <TableHead className="hidden md:table-cell">Depreciated to</TableHead>
                  {canPost && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="min-w-[12rem]">
                      <span className="font-medium">{a.name}</span>
                      {a.status === "disposed" && (
                        <Badge variant="muted" className="ml-2">
                          {a.disposal_kind === "sale" ? "Sold" : "Written off"} {a.disposed_on ? formatBsYmd(a.disposed_on) : ""}
                        </Badge>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {[a.category, a.asset_tag, a.location, branchName(a.branch_id), `Pool ${a.tax_pool}`].filter(Boolean).join(" · ")}
                      </span>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap">
                      {formatBsYmd(a.acquisition_date)}
                      <span className="block text-xs text-muted-foreground">{a.acquisition_date}</span>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm lg:table-cell">
                      {METHOD_LABEL[a.method]}
                      <span className="block text-xs text-muted-foreground">
                        {a.method === "straight_line" ? `${a.useful_life_months ?? "—"} months` : `${a.rate_percent ?? "—"}% a year`}
                      </span>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{amount(a.cost)}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{amount(a.accumulated_depreciation)}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right font-medium">{amount(a.net_book_value)}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                      {a.depreciated_through ?? "Not yet"}
                    </TableCell>
                    {canPost && (
                      <TableCell className="whitespace-nowrap text-right">
                        {a.status === "active" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${a.name}`}
                              onClick={() => {
                                setEditing(a)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil aria-hidden />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label={`Dispose of ${a.name}`} onClick={() => setDisposing(a)}>
                              <PackageMinus aria-hidden />
                            </Button>
                            {!a.has_posted_depreciation && (
                              <Button variant="ghost" size="icon" aria-label={`Delete ${a.name}`} onClick={() => setDeleting(a)}>
                                <Trash2 aria-hidden />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className={stickyFooterClass}>
                <TableRow className={totalsRowClass}>
                  <TableCell colSpan={2}>Total ({rows.length})</TableCell>
                  <TableCell className="hidden lg:table-cell" />
                  <TableCell className="num whitespace-nowrap text-right">{amount(shown.cost)}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{amount(shown.accumulated)}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{amount(shown.nbv)}</TableCell>
                  <TableCell className="hidden md:table-cell" />
                  {canPost && <TableCell />}
                </TableRow>
              </TableFooter>
            </ScrollTable>
          </QueryState>
        </CardContent>
      </Card>

      {formOpen && (
        <FixedAssetFormDialog
          open
          onOpenChange={(o) => {
            setFormOpen(o)
            if (!o) setEditing(null)
          }}
          asset={editing}
          branches={branches}
        />
      )}
      {disposing && <DisposeFixedAssetDialog asset={disposing} onOpenChange={(o) => !o && setDisposing(null)} />}
      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => !remove.isPending && setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete this asset?"
        description={
          <>
            {deleting?.name} is removed from the register and its acquisition voucher is reversed.
            {deleting?.supplier_id ? " The bill is also taken off the supplier's account — not possible once it has been paid." : ""}
          </>
        }
        confirmText="Delete asset"
        loading={remove.isPending}
      />
    </div>
  )
}
