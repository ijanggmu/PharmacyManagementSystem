"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CASH_SHIFT_BRANCH_SUMMARY_QUERY_KEY } from "@/lib/hooks/money-movement-queries"
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
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton"
import { Banknote, Clock, Info, Lock, LockOpen, MinusCircle, PlusCircle, CheckCircle2, Printer } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { BranchScopeBadge } from "@/features/branches/components/branch-scope-badge"
import { SwitchBranchNotice, useIsOtherBranch } from "@/features/branches/components/switch-branch-notice"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { buildZReportHtml } from "@/features/cash-shifts/lib/z-report"

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
  // React Query, so a sale/return/refund/cancel anywhere in the app marks the drawer summary stale.
  const queryClient = useQueryClient()
  const summaryQuery = useQuery<BranchCashSummaryRow[]>({
    queryKey: [...CASH_SHIFT_BRANCH_SUMMARY_QUERY_KEY],
    queryFn: () => cashShiftsApi.branchSummary(),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const summary: BranchCashSummaryRow[] | null = summaryQuery.data ?? null
  const summaryNote: string | null = summaryQuery.isError
    ? "Multi-branch cash overview requires reports access (managers / admins)."
    : null
  const { profile: pharmacyProfile } = usePharmacyProfile()
  const [loading, setLoading] = useState(false)
  const [shiftsLoading, setShiftsLoading] = useState(true)
  // The branch whose shifts were last loaded. Until it matches the selected branch the drawer state is unknown,
  // so a placeholder shows — not the "Open shift" form for a drawer that may already be open.
  const [shiftsLoadedFor, setShiftsLoadedFor] = useState<string | null>(null)
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

  // The branch the latest shifts request was for: a slower answer for a branch no longer selected (the branch
  // settles a moment after load, e.g. when another user signed in on this counter first) must not overwrite it,
  // or the till shows "No open shift" while the drawer is open.
  const shiftsRequestBranch = useRef<string | null>(null)
  const refreshShifts = async () => {
    const requestedBranch = branchId
    shiftsRequestBranch.current = requestedBranch
    setShiftsLoading(true)
    setShiftsError(null)
    try {
      const list = await cashShiftsApi.list({ branch_id: requestedBranch || undefined })
      if (shiftsRequestBranch.current !== requestedBranch) return
      setShifts(list)
      setShiftsPage(1)
      const open = list.find((s) => s.status.toLowerCase() === "open" && s.branch_id === requestedBranch) ?? null
      setOpenShift(open)
      setShiftsLoadedFor(requestedBranch)
      setShiftsLoading(false)
    } catch (e) {
      if (shiftsRequestBranch.current !== requestedBranch) return
      setShiftsError(e instanceof Error ? e.message : "Could not load shifts")
      setShiftsLoadedFor(requestedBranch)
      setShiftsLoading(false)
      toast({
        title: "Shifts",
        description: e instanceof Error ? e.message : "Could not load shifts",
        variant: "destructive",
      })
    }
  }

  const trySummary = async () => {
    await queryClient.invalidateQueries({ queryKey: [...CASH_SHIFT_BRANCH_SUMMARY_QUERY_KEY] })
  }

  useEffect(() => {
    void loadBranches()
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

  const printZReport = async (shift: CashShift) => {
    try {
      const shiftSummary = await cashShiftsApi.summary(shift.id)
      const branchName = branches.find((b) => b.id === (shift.branch_id || branchId))?.name ?? null
      await printHtmlDocument(
        buildZReportHtml({
          summary: shiftSummary,
          profile: pharmacyProfile,
          branchName,
          openedBy: shift.opened_by_name,
          closedBy: shift.closed_by_name,
          closingNotes: shift.notes_closing,
        })
      )
    } catch (e) {
      toast({
        title: "Couldn't print the Z-report",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
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
    if (closingNoteRequired && !notesClose.trim()) {
      toast({
        title: "Add a closing note",
        description: "The drawer doesn't match the expected cash. Say why (e.g. change given in error) before closing.",
        variant: "destructive",
      })
      return
    }
    setLoading(true)
    try {
      const closed = await cashShiftsApi.close(openShift.id, {
        counted_cash_closing: n,
        notes_closing: notesClose.trim() || null,
      })
      toast({ title: "Shift closed", description: "Variance recorded on the shift. Printing the Z-report." })
      setCountedClose("")
      setNotesClose("")
      await refreshShifts()
      await trySummary()
      // The Z-report goes in the cash bag with the counted drawer.
      void printZReport({ ...closed, id: openShift.id, branch_id: closed.branch_id || openShift.branch_id })
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
  // Short or over: the close needs the reason (the server refuses it without one).
  const closingNoteRequired = previewVariance !== null && Math.abs(previewVariance) >= 0.005

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Cashier / Z-out"
          icon={Banknote}
          description="Open the cash drawer at the start of a shift and count it at close. Expected cash = opening float + cash sales + cash customers paid on account − cash paid back for returns and refunds (card and wallet excluded)."
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

                {(branchId ? shiftsLoadedFor !== branchId : branchAccess.isLoading) ? (
                  <div className="space-y-3 rounded-lg border p-4" aria-busy="true" aria-label="Loading the drawer">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-9 w-32" />
                  </div>
                ) : openShift ? (
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
                          {(branchSummary.cash_receipts_since_open ?? 0) > 0 && (
                            <div>
                              <dt className="text-muted-foreground">Cash received on account</dt>
                              <dd className="num font-medium">
                                <CurrencyDisplay amount={branchSummary.cash_receipts_since_open ?? 0} />
                              </dd>
                            </div>
                          )}
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
                        Closing notes{" "}
                        {closingNoteRequired ? (
                          <span className="text-destructive">*</span>
                        ) : (
                          <span className="font-normal text-muted-foreground">(optional)</span>
                        )}
                      </Label>
                      <Input
                        id="nclose"
                        value={notesClose}
                        onChange={(e) => setNotesClose(e.target.value)}
                        placeholder="e.g. Short by 50, change given in error"
                        aria-required={closingNoteRequired}
                        aria-describedby={closingNoteRequired ? "nclose-help" : undefined}
                      />
                      {closingNoteRequired && (
                        <p id="nclose-help" className="text-xs text-muted-foreground">
                          Required: the count doesn&apos;t match the expected cash.
                        </p>
                      )}
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
                  Closing the drawer
                </CardTitle>
                <CardDescription>What to do at the end of a shift</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>Count every note and coin in the drawer, including the opening float.</li>
                  <li>Enter the total. The difference from the expected cash shows before you close.</li>
                  <li>Close the shift. The Z-report prints so it can go in the cash bag.</li>
                </ol>
                <p>Card, QR and wallet payments are not in the drawer, so they are not counted here.</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {summary && summary.length > 0 ? (
          <Section spacing="lg">
            <Card>
              <CardHeader>
                <CardTitle>Expected cash by branch</CardTitle>
                <CardDescription>
                  Open shifts only: opening float + cash sales + cash received on account − cash refunds, since the
                  shift opened.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Opening float</TableHead>
                      <TableHead className="text-right">Cash sales</TableHead>
                      <TableHead className="text-right">Received on account</TableHead>
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
                          {r.open_shift_id ? <CurrencyDisplay amount={r.cash_receipts_since_open ?? 0} /> : "—"}
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
                      <TableHead className="text-right">
                        <span className="sr-only">Report</span>
                      </TableHead>
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
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void printZReport(s)}
                              aria-label={isOpen ? "Print X-report for the open shift" : "Print Z-report"}
                            >
                              <Printer aria-hidden />
                              {isOpen ? "X-report" : "Z-report"}
                            </Button>
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
