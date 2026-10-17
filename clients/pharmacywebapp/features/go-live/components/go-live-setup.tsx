"use client"

import { useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, Circle, Download, FileSpreadsheet, Loader2, RefreshCw, Rocket, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { accountingApi } from "@/features/accounting/api-client"
import { openingBalancesApi } from "@/features/accounting/api-client-opening-balances"
import { useOpeningBalanceState } from "@/features/accounting/hooks/use-opening-balances"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { importsApi } from "@/features/imports/api-client"
import { downloadWorkbook } from "@/features/imports/lib/spreadsheet"
import { importFingerprint } from "@/features/imports/lib/import-report"
import { suppliersApi } from "@/features/suppliers/api-client"
import {
  GO_LIVE_BALANCE_COLUMNS,
  GO_LIVE_CUSTOMER_COLUMNS,
  GO_LIVE_SHEETS,
  GO_LIVE_STOCK_COLUMNS,
  GO_LIVE_SUPPLIER_COLUMNS,
  goLiveTemplateSheets,
  readGoLiveWorkbook,
  supplierKey,
  type GoLiveSection,
  type GoLiveSheets,
} from "@/features/go-live/lib/go-live-workbook"
import {
  GO_LIVE_STEPS,
  checkGoLive,
  runGoLive,
  type GoLiveCheck,
  type GoLiveDeps,
  type GoLiveStep,
} from "@/features/go-live/lib/go-live-run"

const COLUMN_LABELS: Record<GoLiveSection, Map<string, string>> = {
  suppliers: new Map(GO_LIVE_SUPPLIER_COLUMNS.map((c) => [c.key, c.label])),
  customers: new Map(GO_LIVE_CUSTOMER_COLUMNS.map((c) => [c.key, c.label])),
  stock: new Map(GO_LIVE_STOCK_COLUMNS.map((c) => [c.key, c.label])),
  balances: new Map(GO_LIVE_BALANCE_COLUMNS.map((c) => [c.key, c.label])),
}

const STEP_LABELS: Record<GoLiveStep, string> = {
  suppliers: "Suppliers and what you owe them",
  customers: "Customers and what they owe you",
  stock: "Medicines and stock (yours and consignment)",
  balances: "Cash and bank",
}

type StepState = "waiting" | "running" | "done" | "skipped"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** A short stable id for a file + date, used to remember which steps of it were already saved. */
function fileId(fingerprint: string): string {
  let h = 5381
  for (let i = 0; i < fingerprint.length; i++) h = ((h << 5) + h + fingerprint.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function stored(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Storage unavailable: a retry in this page still reuses the in-memory keys.
  }
}

/**
 * Go-live setup: one Excel file with suppliers, customers, medicines and stock (owned or consigned) and cash & bank,
 * checked as a whole and saved in one go on the go-live date.
 */
export function GoLiveSetup() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const access = useBranchAccess()
  const branchId = access.currentBranchId ?? access.ownBranchId
  const opening = useOpeningBalanceState(branchId)

  const [goLiveDate, setGoLiveDate] = useState(() => nepalTodayYmd())
  const [fileName, setFileName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<GoLiveSheets | null>(null)
  const [check, setCheck] = useState<{ result: GoLiveCheck; fingerprint: string } | null>(null)
  const [busy, setBusy] = useState<"reading" | "checking" | "saving" | null>(null)
  const [steps, setSteps] = useState<Record<GoLiveStep, StepState> | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const keys = useRef(new Map<string, string>())
  const fileInput = useRef<HTMLInputElement>(null)

  const fingerprint = useMemo(() => (sheets ? importFingerprint("go-live", [sheets], { goLiveDate, branchId }) : ""), [sheets, goLiveDate, branchId])
  const id = fingerprint ? fileId(fingerprint) : ""

  const deps: GoLiveDeps = {
    importSuppliers: (rows, dryRun, key) => importsApi.suppliers(rows, { duplicateMode: "skip", asOfDate: goLiveDate }, dryRun, key),
    importCustomers: (rows, dryRun, key) => importsApi.customers(rows, { duplicateMode: "skip", asOfDate: goLiveDate }, dryRun, key),
    importStock: (rows, dryRun, key) => importsApi.goLiveStock(rows, goLiveDate, dryRun, key),
    findSuppliers: async (names) => {
      const ids = new Map<string, string>()
      for (const name of names) {
        const { data, error } = await suppliersApi.getSupplierOptions({ search: name, includeInactive: true, limit: 50 })
        if (error) throw new Error(error)
        const match = data.find((s) => supplierKey(s.name) === supplierKey(name))
        if (match) ids.set(supplierKey(name), match.id)
      }
      return ids
    },
    cashAndBankAccounts: async () => {
      const accounts = await accountingApi.getAccounts()
      const cash = accounts.find((a) => a.code === "1000")
      const bank = accounts.find((a) => a.code === "1010")
      if (!cash || !bank) throw new Error("The Cash (1000) or Bank (1010) account is missing from the chart of accounts.")
      return { cash: cash.id, bank: bank.id }
    },
    openingState: async () => {
      const state = await openingBalancesApi.get(branchId as string)
      return {
        isSet: state.isSet,
        version: state.version,
        lines: state.lines.map((l) => ({ accountId: l.accountId, debitAmount: l.debitAmount, creditAmount: l.creditAmount })),
      }
    },
    setOpening: (lines, requestId) =>
      openingBalancesApi.set({ requestId, branchId: branchId as string, openingDate: goLiveDate, lines, reason: "Go-live setup" }),
    editOpening: (lines, expectedVersion, requestId) =>
      openingBalancesApi.edit({ requestId, branchId: branchId as string, openingDate: goLiveDate, lines, expectedVersion, reason: "Go-live setup" }),
    newId: () => crypto.randomUUID(),
  }

  const runCheck = async (next: GoLiveSheets) => {
    setBusy("checking")
    setRunError(null)
    try {
      const result = await checkGoLive(next, goLiveDate, deps)
      setCheck({ result, fingerprint: importFingerprint("go-live", [next], { goLiveDate, branchId }) })
    } catch (error) {
      toast({ title: "Could not check the file", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy("reading")
    setFinished(false)
    setSteps(null)
    try {
      const read = await readGoLiveWorkbook(file)
      setFileName(file.name)
      setSheets(read)
      await runCheck(read)
    } catch (error) {
      setBusy(null)
      toast({ title: "Could not read that file", description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    } finally {
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const editCell = (section: GoLiveSection, rowNumber: number, field: string, value: string) => {
    if (!sheets) return
    setSheets({
      ...sheets,
      [section]: {
        ...sheets[section],
        rows: sheets[section].rows.map((r) => (r.rowNumber === rowNumber ? { ...r, cells: { ...r.cells, [field]: value } } : r)),
      },
    })
  }

  const keyFor = (step: GoLiveStep) => {
    const storageKey = `go-live:${id}:${step}`
    const existing = keys.current.get(storageKey) ?? stored(storageKey)
    if (existing) return existing
    const key = crypto.randomUUID()
    keys.current.set(storageKey, key)
    store(storageKey, key)
    return key
  }

  const goLive = async () => {
    if (!sheets || !branchId) return
    const doneKey = `go-live:${id}:done`
    const done = new Set<GoLiveStep>((stored(doneKey) ?? "").split(",").filter(Boolean) as GoLiveStep[])
    setBusy("saving")
    setRunError(null)
    setSteps(Object.fromEntries(GO_LIVE_STEPS.map((s) => [s, done.has(s) ? "done" : "waiting"])) as Record<GoLiveStep, StepState>)
    try {
      await runGoLive(sheets, goLiveDate, deps, {
        done,
        keyFor,
        onStep: (step, state) => {
          if (state === "done") {
            done.add(step)
            store(doneKey, [...done].join(","))
          }
          setSteps((prev) => (prev ? { ...prev, [step]: done.has(step) ? "done" : state } : prev))
        },
      })
      setFinished(true)
      toast({ title: "You're live", description: "Everything from the file is saved." })
    } catch (error) {
      setRunError(apiRequestErrorMessage(error))
    } finally {
      setBusy(null)
      void queryClient.invalidateQueries()
    }
  }

  const result = check?.result
  const stale = !!check && check.fingerprint !== fingerprint
  const canGoLive = !!result && !stale && result.problems.length === 0 && !busy && !finished && !!branchId

  return (
    <div className="space-y-6">
      {opening.data?.isSet && !finished && (
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4" role="status">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">Go-live done{opening.data.openingDate ? ` on ${opening.data.openingDate}` : ""}</p>
            <p className="text-muted-foreground">
              Forgot something? Upload a file with just those rows. Stock already on the shelf is flagged before it is added again.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Go-live date</CardTitle>
          <CardDescription>The day you start using PharmaCare. Every opening amount is saved on this date.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-xs space-y-2">
          <Label htmlFor="go-live-date">Go-live date</Label>
          <DatePicker id="go-live-date" value={goLiveDate} onChange={(v) => v && setGoLiveDate(v)} disabled={!!busy} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Fill in the go-live file</CardTitle>
          <CardDescription>
            One Excel file with four sheets: {GO_LIVE_SHEETS.suppliers}, {GO_LIVE_SHEETS.customers}, {GO_LIVE_SHEETS.stock} and{" "}
            {GO_LIVE_SHEETS.balances}. Leave a sheet empty if you have nothing for it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() =>
              void downloadWorkbook("go-live-setup.xlsx", goLiveTemplateSheets()).catch(() =>
                toast({ title: "Could not create the file", variant: "destructive" }),
              )
            }
          >
            <Download aria-hidden /> Download the go-live file
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Upload it and check</CardTitle>
          <CardDescription>Nothing is saved yet — the whole file is checked first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            id="go-live-file"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={!!busy}>
            {busy === "reading" ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} Upload the filled file
          </Button>
          {fileName && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" aria-hidden /> {fileName}
            </span>
          )}
          {sheets && (
            <Button variant="outline" onClick={() => void runCheck(sheets)} disabled={!!busy}>
              {busy === "checking" ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Check again
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What will be saved</CardTitle>
            {stale && <CardDescription>The file or date changed — press Check again.</CardDescription>}
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm sm:grid-cols-2" aria-label="Go-live summary">
              <li>
                <span className="font-medium">{plural(result.suppliers.count, "supplier")}</span> ({result.suppliers.newCount} new) · you owe{" "}
                <CurrencyDisplay amount={result.suppliers.owed} />
              </li>
              <li>
                <span className="font-medium">{plural(result.customers.count, "customer")}</span> ({result.customers.newCount} new) · they owe you{" "}
                <CurrencyDisplay amount={result.customers.owed} />
              </li>
              <li>
                <span className="font-medium">{plural(result.stock.rows - result.stock.consignedRows, "stock line")}</span> of your own ·{" "}
                <CurrencyDisplay amount={result.stock.value} /> · {plural(result.stock.newMedicines, "new medicine")}
              </li>
              <li>
                <span className="font-medium">{plural(result.stock.consignedRows, "consignment line")}</span> from{" "}
                {plural(result.stock.consignedSuppliers, "supplier")} (paid when sold)
              </li>
              <li>
                <span className="font-medium">Cash</span> <CurrencyDisplay amount={result.balances.cash} /> ·{" "}
                <span className="font-medium">Bank</span> <CurrencyDisplay amount={result.balances.bank} />
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {result && result.problems.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden /> {result.problems.length} problem
              {result.problems.length === 1 ? "" : "s"} to fix
            </CardTitle>
            <CardDescription>Correct the value here (or in Excel and upload again), then press Check again.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Row</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead className="min-w-48">Fix</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.problems.map((p, i) => {
                  const label = COLUMN_LABELS[p.section].get(p.field)
                  const row = sheets?.[p.section].rows.find((r) => r.rowNumber === p.rowNumber)
                  return (
                    <TableRow key={`${p.section}-${p.rowNumber}-${p.field}-${i}`}>
                      <TableCell>{GO_LIVE_SHEETS[p.section]}</TableCell>
                      <TableCell className="num">{p.rowNumber}</TableCell>
                      <TableCell className="text-sm">{p.message}</TableCell>
                      <TableCell>
                        {label && row ? (
                          <Input
                            aria-label={`${GO_LIVE_SHEETS[p.section]} row ${p.rowNumber}: ${label}`}
                            value={row.cells[p.field] ?? ""}
                            onChange={(e) => editCell(p.section, p.rowNumber, p.field, e.target.value)}
                            placeholder={label}
                            disabled={!!busy}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">Fix in the file and upload again</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Go live</CardTitle>
            <CardDescription>
              Saves everything in order. If the connection drops, press Go live again — it continues where it stopped and never saves
              anything twice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {steps && (
              <ol className="space-y-2 text-sm" aria-label="Go-live progress">
                {GO_LIVE_STEPS.map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    {steps[s] === "running" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                    ) : steps[s] === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
                    )}
                    <span>{STEP_LABELS[s]}</span>
                    {steps[s] === "skipped" && <Badge variant="outline">nothing to save</Badge>}
                  </li>
                ))}
              </ol>
            )}
            {runError && (
              <p className="text-sm text-destructive" role="alert">
                Stopped: {runError}
              </p>
            )}
            {finished ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success" role="status">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> You&apos;re live. Stock, suppliers, customers and balances are saved.
              </p>
            ) : (
              <Button onClick={() => void goLive()} disabled={!canGoLive}>
                {busy === "saving" ? <Loader2 className="animate-spin" aria-hidden /> : <Rocket aria-hidden />}{" "}
                {runError ? "Continue going live" : "Go live"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
