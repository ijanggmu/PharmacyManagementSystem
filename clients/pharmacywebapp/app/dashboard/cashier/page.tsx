"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import { useToast } from "@/hooks/use-toast"
import { cashShiftsApi, type BranchCashSummaryRow, type CashShift } from "@/features/cash-shifts/api-client"
import { dotnetClient } from "@/lib/api/dotnet-client"
import { CurrencyDisplay } from "@/components/currency-display"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Banknote, Clock, Info, Lock, LockOpen, MinusCircle, PlusCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { BranchScopeBadge } from "@/features/branches/components/branch-scope-badge"
import { SwitchBranchNotice, useIsOtherBranch } from "@/features/branches/components/switch-branch-notice"

/** Counted − expected. Negative means the drawer is short, positive means it is over. */
const SHIFTS_PAGE_SIZE = 20

function VarianceAmount({ value, className }: { value: number; className?: string }) {
  const rounded = Math.round(value * 100) / 100
  if (rounded === 0) {
    return (
      <span className={cn("inline-flex items-center justify-end gap-1 text-success", className)}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        <span className="num">
          <CurrencyDisplay amount={0} />
        </span>
        <span className="text-xs font-medium">Balanced</span>
      </span>
    )
  }
  const over = rounded > 0
  const Icon = over ? PlusCircle : MinusCircle
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 font-medium",
        over ? "text-warning" : "text-destructive",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="num">
        {over ? "+" : "−"}
        <CurrencyDisplay amount={Math.abs(rounded)} />
      </span>
      <span className="text-xs">{over ? "Over" : "Short"}</span>
    </span>
  )
}

interface Branch {
  id: string
  name: string
  code: string
}

export default function CashierShiftsPage() {
  const { toast } = useToast()
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<string>("")
  const [openingFloat, setOpeningFloat] = useState("0")
  const [countedClose, setCountedClose] = useState("")
  const [notesOpen, setNotesOpen] = useState("")
  const [notesClose, setNotesClose] = useState("")
  const [shifts, setShifts] = useState<CashShift[]>([])
  const [openShift, setOpenShift] = useState<CashShift | null>(null)
  const [summary, setSummary] = useState<BranchCashSummaryRow[] | null>(null)
  const [summaryNote, setSummaryNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [shiftsLoading, setShiftsLoading] = useState(true)
  const [shiftsError, setShiftsError] = useState<string | null>(null)
  const [shiftsPage, setShiftsPage] = useState(1)

  const loadBranches = async () => {
    try {
      const data = await dotnetClient
        .get<{ items: Branch[] }>("/branches?pageNumber=1&pageSize=100")
        .then((page) => page.items ?? [])
      setBranches(data ?? [])
    } catch (e) {
      toast({
        title: "Branches",
        description: e instanceof Error ? e.message : "Could not load branches",
        variant: "destructive",
      })
    }
  }

  const refreshShifts = async () => {
    setShiftsLoading(true)
    setShiftsError(null)
    try {
      const list = await cashShiftsApi.list({ branch_id: branchId || undefined })
      setShifts(list)
      setShiftsPage(1)
      const open = list.find((s) => s.status.toLowerCase() === "open" && s.branch_id === branchId) ?? null
      setOpenShift(open)
    } catch (e) {
      setShiftsError(e instanceof Error ? e.message : "Could not load shifts")
      toast({
        title: "Shifts",
        description: e instanceof Error ? e.message : "Could not load shifts",
        variant: "destructive",
      })
    } finally {
      setShiftsLoading(false)
    }
  }

  const trySummary = async () => {
    try {
      const rows = await cashShiftsApi.branchSummary()
      setSummary(rows)
      setSummaryNote(null)
    } catch {
      setSummary(null)
      setSummaryNote("Multi-branch cash overview requires reports access (managers / admins).")
    }
  }

  useEffect(() => {
    void loadBranches()
    void trySummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Start on the user's own branch; users limited to it can't pick another.
  const branchAccess = useBranchAccess()
  const branchLocked = !branchAccess.isLoading && !branchAccess.canViewAll
  const openingElsewhere = useIsOtherBranch(branchId)
  useEffect(() => {
    if (branchAccess.isLoading) return
    const own = branchAccess.ownBranchId
    if (branchLocked) {
      if (own && branchId !== own) setBranchId(own)
      return
    }
    if (!branchId) {
      const fallback = own ?? branches[0]?.id
      if (fallback) setBranchId(fallback)
    }
  }, [branchAccess.isLoading, branchAccess.ownBranchId, branchLocked, branchId, branches])

  useEffect(() => {
    if (branchId) void refreshShifts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId])

  const handleOpen = async () => {
    if (!branchId) return
    const n = Number.parseFloat(openingFloat)
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Invalid float", description: "Enter the opening cash as 0 or more.", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      await cashShiftsApi.open({
        branch_id: branchId,
        opening_float_cash: n,
        notes_opening: notesOpen.trim() || null,
      })
      toast({ title: "Shift opened" })
      setNotesOpen("")
      await refreshShifts()
      await trySummary()
    } catch (e) {
      toast({
        title: "Open failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = async () => {
    if (!openShift) return
    const n = Number.parseFloat(countedClose)
    if (!Number.isFinite(n) || n < 0) {
      toast({
        title: "Enter counted cash",
        description: "Count the drawer and enter the total before closing.",
        variant: "destructive",
      })
      return
    }
    setLoading(true)
    try {
      await cashShiftsApi.close(openShift.id, {
        counted_cash_closing: n,
        notes_closing: notesClose.trim() || null,
      })
      toast({ title: "Shift closed", description: "Variance recorded on the shift." })
      setCountedClose("")
      setNotesClose("")
      await refreshShifts()
      await trySummary()
    } catch (e) {
      toast({
        title: "Close failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const shiftsTotalItems = shifts.length
  const shiftsTotalPages = Math.max(1, Math.ceil(shiftsTotalItems / SHIFTS_PAGE_SIZE))
  const shiftsCurrentPage = Math.min(shiftsPage, shiftsTotalPages)
  const shiftsStartIndex = (shiftsCurrentPage - 1) * SHIFTS_PAGE_SIZE
  const paginatedShifts = shifts.slice(shiftsStartIndex, shiftsStartIndex + SHIFTS_PAGE_SIZE)

  const branchSummary = summary?.find((r) => r.branch_id === branchId && r.open_shift_id) ?? null
  const countedValue = Number.parseFloat(countedClose)
  const previewVariance =
    branchSummary && countedClose.trim() !== "" && Number.isFinite(countedValue)
      ? countedValue - branchSummary.expected_in_drawer
      : null

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Cashier / Z-out"
          icon={Banknote}
          description="Open the cash drawer at the start of a shift and count it at close. Expected cash = opening float + cash sales (card, wallet and refunds excluded)."
        />

        <Section spacing="lg">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Current shift</CardTitle>
                  {branchId &&
                    !shiftsLoading &&
                    (openShift ? (
                      <Badge variant="success">
                        <LockOpen aria-hidden />
                        Drawer open
                      </Badge>
                    ) : (
                      <Badge variant="muted">
                        <Lock aria-hidden />
                        No open shift
                      </Badge>
                    ))}
                </div>
                <CardDescription>
                  {branchLocked ? "Open the drawer or count it to close." : "Choose the branch, then open the drawer or count it to close."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {branchLocked ? (
                    <>
                      <span className="text-sm font-medium leading-none">Branch</span>
                      <BranchScopeBadge branch={branchAccess.ownBranch} className="w-full" />
                    </>
                  ) : (
                    <>
                      <Label htmlFor="cashier-branch">Branch</Label>
                      <Select value={branchId} onValueChange={setBranchId}>
                        <SelectTrigger id="cashier-branch" className="w-full">
                          <SelectValue placeholder="Choose branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name} ({b.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>

                {openShift ? (
                  <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          Open since
                        </dt>
                        <dd className="num font-medium">{new Date(openShift.opened_at).toLocaleString()}</dd>
                      </div>
                      <div className="sm:text-right">
                        <dt className="text-muted-foreground">Opening float</dt>
                        <dd className="num font-medium">
                          <CurrencyDisplay amount={openShift.opening_float_cash} />
                        </dd>
                      </div>
                      {branchSummary && (
                        <>
                          <div>
                            <dt className="text-muted-foreground">Cash sales since open</dt>
                            <dd className="num font-medium">
                              <CurrencyDisplay amount={branchSummary.cash_sales_since_open} />
                            </dd>
                          </div>
                          {(branchSummary.cash_refunds_since_open ?? 0) > 0 && (
                            <div>
                              <dt className="text-muted-foreground">Cash refunds paid out</dt>
                              <dd className="num font-medium text-destructive">
                                −<CurrencyDisplay amount={branchSummary.cash_refunds_since_open ?? 0} />
                              </dd>
                            </div>
                          )}
                          <div className="sm:text-right">
                            <dt className="text-muted-foreground">Expected in drawer</dt>
                            <dd className="num font-display text-lg font-bold">
                              <CurrencyDisplay amount={branchSummary.expected_in_drawer} />
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                    <div className="space-y-2">
                      <Label htmlFor="counted">
                        Counted cash in drawer <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="counted"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={countedClose}
                        onChange={(e) => setCountedClose(e.target.value)}
                        placeholder="0.00"
                        className="num h-11 text-right text-lg"
                        aria-describedby="counted-help"
                      />
                      <p id="counted-help" className="text-xs text-muted-foreground">
                        Count every note and coin in the drawer, including the opening float.
                      </p>
                      {previewVariance !== null && (
                        <p
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                          role="status"
                        >
                          <span className="text-muted-foreground">Variance if closed now</span>
                          <VarianceAmount value={previewVariance} />
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nclose">
                        Closing notes <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="nclose"
                        value={notesClose}
                        onChange={(e) => setNotesClose(e.target.value)}
                        placeholder="e.g. Short by 50, change given in error"
                      />
                    </div>
                    <Button onClick={handleClose} loading={loading} loadingText="Closing shift…" className="w-full sm:w-auto">
                      <Lock aria-hidden />
                      Close shift (Z-out)
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-lg border p-4">
                    <SwitchBranchNotice targetBranchId={branchId} action="open a shift" />
                    <div className="space-y-2">
                      <Label htmlFor="float">
                        Opening float (cash) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="float"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={openingFloat}
                        onChange={(e) => setOpeningFloat(e.target.value)}
                        className="num h-11 text-right text-lg"
                        aria-describedby="float-help"
                      />
                      <p id="float-help" className="text-xs text-muted-foreground">
                        Cash placed in the drawer for change before the first sale.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nopen">
                        Opening notes <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Input id="nopen" value={notesOpen} onChange={(e) => setNotesOpen(e.target.value)} />
                    </div>
                    <Button
                      onClick={handleOpen}
                      disabled={!branchId || openingElsewhere}
                      loading={loading}
                      loadingText="Opening shift…"
                      className="w-full sm:w-auto"
                    >
                      <LockOpen aria-hidden />
                      Open shift
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-muted/30 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="h-4 w-4 text-info" aria-hidden />
                  Receipt vs tax invoice
                </CardTitle>
                <CardDescription>How sale numbers map to IRD documents</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Sale / receipt #</span> — internal POS
                  reference (<span className="font-mono">sale_number</span>).
                </p>
                <p>
                  <span className="font-medium text-foreground">Tax invoice #</span> — printed on customer
                  invoice for IRD / VAT (<span className="font-mono">invoice_number</span>), assigned when the
                  sale is posted.
                </p>
                <p>
                  IRD Annex 13 and sales register export both columns when present. Older rows may have an empty
                  invoice until backfilled.
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {summary && summary.length > 0 ? (
          <Section spacing="lg">
            <Card>
              <CardHeader>
                <CardTitle>Expected cash by branch</CardTitle>
                <CardDescription>Open shifts only: opening float + cash sales since the shift opened.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Opening float</TableHead>
                      <TableHead className="text-right">Cash sales</TableHead>
                      <TableHead className="text-right">Cash refunds</TableHead>
                      <TableHead className="text-right">Expected in drawer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.map((r) => (
                      <TableRow key={r.branch_id}>
                        <TableCell className="font-medium">{r.branch_name}</TableCell>
                        <TableCell className="num text-right">
                          {r.open_shift_id ? <CurrencyDisplay amount={r.opening_float} /> : "—"}
                        </TableCell>
                        <TableCell className="num text-right">
                          {r.open_shift_id ? <CurrencyDisplay amount={r.cash_sales_since_open} /> : "—"}
                        </TableCell>
                        <TableCell className="num text-right">
                          {r.open_shift_id ? <CurrencyDisplay amount={r.cash_refunds_since_open ?? 0} /> : "—"}
                        </TableCell>
                        <TableCell className="num text-right font-semibold">
                          {r.open_shift_id ? (
                            <CurrencyDisplay amount={r.expected_in_drawer} />
                          ) : (
                            <span className="font-normal text-muted-foreground">No open shift</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Section>
        ) : summaryNote ? (
          <p className="mb-6 flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            {summaryNote}
          </p>
        ) : null}

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Recent shifts</CardTitle>
              <CardDescription>This branch, newest first. Variance = counted − expected.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {!branchId ? (
                <EmptyState
                  size="compact"
                  icon={Banknote}
                  title="Choose a branch"
                  description="Select a branch above to see its cash shifts."
                />
              ) : shiftsLoading && shifts.length === 0 ? (
                <SkeletonTable rows={4} cols={6} />
              ) : shiftsError ? (
                <ErrorState
                  size="compact"
                  title="Couldn't load shifts"
                  message={shiftsError}
                  onRetry={() => void refreshShifts()}
                  retrying={shiftsLoading}
                />
              ) : shifts.length === 0 ? (
                <EmptyState
                  size="compact"
                  icon={Banknote}
                  title="No shifts yet"
                  description="Open the first shift above with the cash float in the drawer. Closed shifts and their variance will be listed here."
                />
              ) : (
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Opened</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Float</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Counted</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedShifts.map((s) => {
                      const isOpen = s.status.toLowerCase() === "open"
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="num whitespace-nowrap text-sm">
                            {new Date(s.opened_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={isOpen ? "success" : "muted"} className="capitalize">
                              {isOpen ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
                              {s.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="num text-right">
                            <CurrencyDisplay amount={s.opening_float_cash} />
                          </TableCell>
                          <TableCell className="num text-right">
                            {s.expected_cash_system != null ? (
                              <CurrencyDisplay amount={s.expected_cash_system} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="num text-right">
                            {s.counted_cash_closing != null ? (
                              <CurrencyDisplay amount={s.counted_cash_closing} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {s.cash_variance != null ? (
                              <VarianceAmount value={s.cash_variance} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <Pagination
                  currentPage={shiftsCurrentPage}
                  totalPages={shiftsTotalPages}
                  totalItems={shiftsTotalItems}
                  itemsPerPage={SHIFTS_PAGE_SIZE}
                  startIndex={shiftsStartIndex}
                  onPageChange={setShiftsPage}
                  className="mt-4"
                />
                </>
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
