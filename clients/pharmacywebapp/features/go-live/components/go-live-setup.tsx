"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Circle, Download, FileSpreadsheet, Loader2, RefreshCw, Rocket, ThumbsDown, ThumbsUp, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useCurrency } from "@/lib/contexts/currency-context"
import { useTranslations } from "@/lib/i18n/i18n-provider"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { cn } from "@/lib/utils"
import { accountingApi } from "@/features/accounting/api-client"
import { openingBalancesApi } from "@/features/accounting/api-client-opening-balances"
import { useOpeningBalanceState } from "@/features/accounting/hooks/use-opening-balances"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { importsApi } from "@/features/imports/api-client"
import { downloadWorkbook } from "@/features/imports/lib/spreadsheet"
import { importFingerprint } from "@/features/imports/lib/import-report"
import { suppliersApi } from "@/features/suppliers/api-client"
import {
  goLiveTemplateSheets,
  mapGoLiveBalances,
  problemSheets,
  readGoLiveWorkbook,
  supplierKey,
  type GoLiveSection,
  type GoLiveSheets,
  type GoLiveTemplateOptions,
} from "@/features/go-live/lib/go-live-workbook"
import { GO_LIVE_STEPS, checkGoLive, runGoLive, type GoLiveCheck, type GoLiveDeps, type GoLiveStep } from "@/features/go-live/lib/go-live-run"
import { GoLiveAnswers, GoLiveQuestions, storeAnswers, storedAnswers } from "@/features/go-live/components/go-live-questions"
import { GoLiveProblems, GoLiveSummary } from "@/features/go-live/components/go-live-review"

type StepState = "waiting" | "running" | "done" | "skipped"

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

/** A typed rupee amount: blank is 0; anything that isn't a non-negative number is null (invalid). */
function amountOf(text: string): number | null {
  const trimmed = text.replace(/,/g, "").trim()
  if (trimmed === "") return 0
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function Stepper({ current, done }: { current: number; done: boolean }) {
  const t = useTranslations("goLive")
  const labels = [t("steps.about"), t("steps.start"), t("steps.review"), t("steps.live")]
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Go-live steps">
      {labels.map((label, i) => {
        const state = done || i < current ? "done" : i === current ? "current" : "next"
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
                state === "done" && "border-success bg-success text-success-foreground",
                state === "current" && "border-primary bg-primary text-primary-foreground",
                state === "next" && "text-muted-foreground",
              )}
            >
              {state === "done" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn(state === "next" && "text-muted-foreground", state === "current" && "font-medium")}>{label}</span>
            {i < labels.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

function Guide({ options }: { options: GoLiveTemplateOptions }) {
  const t = useTranslations("goLive")
  const items = [
    { title: t("prepare.guideStock"), add: t("prepare.stockAdd"), dontAdd: t("prepare.stockDontAdd") },
    ...(options.suppliers ? [{ title: t("prepare.guideSuppliers"), add: t("prepare.suppliersAdd"), dontAdd: t("prepare.suppliersDontAdd") }] : []),
    ...(options.customers ? [{ title: t("prepare.guideCustomers"), add: t("prepare.customersAdd"), dontAdd: t("prepare.customersDontAdd") }] : []),
    { title: t("prepare.guideCash"), add: t("prepare.cashAdd"), dontAdd: t("prepare.cashDontAdd") },
  ]
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.title} className="space-y-1.5 rounded-lg border p-3 text-sm">
          <p className="font-medium">{item.title}</p>
          <p className="flex gap-2">
            <ThumbsUp className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label={t("prepare.add")} />
            <span>{item.add}</span>
          </p>
          <p className="flex gap-2 text-muted-foreground">
            <ThumbsDown className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label={t("prepare.dontAdd")} />
            <span>{item.dontAdd}</span>
          </p>
        </li>
      ))}
    </ul>
  )
}

/**
 * Go-live setup in four steps an owner can follow without an accountant: a few yes/no questions decide what the
 * Excel file asks for; the start date, cash and bank are typed here; the filled file is checked as a whole (problems
 * named, paginated and fixable here or in Excel); then everything is saved on the start date in one go.
 */
export function GoLiveSetup() {
  const t = useTranslations("goLive")
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const queryClient = useQueryClient()
  const access = useBranchAccess()
  const branchId = access.currentBranchId ?? access.ownBranchId
  const opening = useOpeningBalanceState(branchId)

  const [answers, setAnswers] = useState<GoLiveTemplateOptions | null>(null)
  const [editingAnswers, setEditingAnswers] = useState(false)
  useEffect(() => {
    const saved = storedAnswers()
    setAnswers(saved)
    setEditingAnswers(saved === null)
  }, [])

  const [goLiveDate, setGoLiveDate] = useState(() => nepalTodayYmd())
  const [cashText, setCashText] = useState("")
  const [bankText, setBankText] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<GoLiveSheets | null>(null)
  // Bumped on every new file or fix, so "is the check stale?" never has to compare whole workbooks.
  const [version, setVersion] = useState(0)
  const [check, setCheck] = useState<{ result: GoLiveCheck; version: number; goLiveDate: string; branchId: string | null } | null>(null)
  const [busy, setBusy] = useState<"reading" | "checking" | "saving" | null>(null)
  const [steps, setSteps] = useState<Record<GoLiveStep, StepState> | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const keys = useRef(new Map<string, string>())
  const fileInput = useRef<HTMLInputElement>(null)
  const sheetsRef = useRef<GoLiveSheets | null>(null)
  sheetsRef.current = sheets

  const cash = amountOf(cashText)
  const bank = amountOf(bankText)

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
      const cashAccount = accounts.find((a) => a.code === "1000")
      const bankAccount = accounts.find((a) => a.code === "1010")
      if (!cashAccount || !bankAccount) throw new Error("The Cash (1000) or Bank (1010) account is missing from the chart of accounts.")
      return { cash: cashAccount.id, bank: bankAccount.id }
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

  const runCheck = async (next: GoLiveSheets, atVersion: number) => {
    setBusy("checking")
    setRunError(null)
    try {
      const result = await checkGoLive(next, goLiveDate, deps)
      setCheck({ result, version: atVersion, goLiveDate, branchId })
    } catch (error) {
      toast({ title: t("live.checkFail"), description: apiRequestErrorMessage(error), variant: "destructive" })
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
      // An older file carries cash and bank in a sheet: use it unless the owner already typed the amounts.
      if (read.balances.rows.length > 0) {
        const fromSheet = mapGoLiveBalances(read.balances.rows)
        if (cashText.trim() === "" && fromSheet.cash > 0) setCashText(String(fromSheet.cash))
        if (bankText.trim() === "" && fromSheet.bank > 0) setBankText(String(fromSheet.bank))
      }
      const nextVersion = version + 1
      setFileName(file.name)
      setSheets(read)
      setVersion(nextVersion)
      await runCheck(read, nextVersion)
    } catch (error) {
      setBusy(null)
      toast({ title: t("live.readFail"), description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    } finally {
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  // Stable, so only the fixed row re-renders (ProblemRow is memoised); the other rows keep their objects.
  const editCell = useCallback((section: GoLiveSection, rowNumber: number, field: string, value: string) => {
    setSheets((prev) => {
      if (!prev) return prev
      const rows = prev[section].rows
      const index = rows.findIndex((r) => r.rowNumber === rowNumber)
      if (index < 0) return prev
      const nextRows = rows.slice()
      nextRows[index] = { ...rows[index], cells: { ...rows[index].cells, [field]: value } }
      const next = { ...prev, [section]: { ...prev[section], rows: nextRows } }
      sheetsRef.current = next
      return next
    })
    setVersion((v) => v + 1)
  }, [])

  const downloadProblems = () => {
    if (!sheets || !check) return
    const messages = new Map<GoLiveSection, Map<number, string[]>>()
    const add = (section: GoLiveSection, rowNumber: number, message: string) => {
      const bySection = messages.get(section) ?? new Map<number, string[]>()
      bySection.set(rowNumber, [...(bySection.get(rowNumber) ?? []), message])
      messages.set(section, bySection)
    }
    for (const p of check.result.problems) add(p.section, p.rowNumber, p.message)
    for (const w of check.result.warnings) add(w.section, w.rowNumber, `Check: ${w.message}`)
    void downloadWorkbook("go-live-problems.xlsx", problemSheets(sheets, messages)).catch(() =>
      toast({ title: t("live.downloadFail"), variant: "destructive" }),
    )
  }

  const goLive = async () => {
    setConfirming(false)
    if (!sheets || !branchId || cash === null || bank === null) return
    // Computed once per run (not per render): the resume keys only need the file, date and branch.
    const id = fileId(importFingerprint("go-live", [sheets], { goLiveDate, branchId }))
    const doneKey = `go-live:${id}:done`
    const keyFor = (step: GoLiveStep) => {
      const storageKey = `go-live:${id}:${step}`
      const existing = keys.current.get(storageKey) ?? stored(storageKey)
      if (existing) return existing
      const key = crypto.randomUUID()
      keys.current.set(storageKey, key)
      store(storageKey, key)
      return key
    }
    const done = new Set<GoLiveStep>((stored(doneKey) ?? "").split(",").filter(Boolean) as GoLiveStep[])
    setBusy("saving")
    setRunError(null)
    setSteps(Object.fromEntries(GO_LIVE_STEPS.map((s) => [s, done.has(s) ? "done" : "waiting"])) as Record<GoLiveStep, StepState>)
    try {
      await runGoLive(sheets, goLiveDate, deps, {
        done,
        keyFor,
        balances: { cash, bank },
        onStep: (step, state) => {
          if (state === "done") {
            done.add(step)
            store(doneKey, [...done].join(","))
          }
          setSteps((prev) => (prev ? { ...prev, [step]: done.has(step) ? "done" : state } : prev))
        },
      })
      setFinished(true)
      toast({ title: t("live.toastDone"), description: t("live.toastDoneBody") })
    } catch (error) {
      setRunError(apiRequestErrorMessage(error))
    } finally {
      setBusy(null)
      void queryClient.invalidateQueries()
    }
  }

  const result = check?.result
  const stale = !!check && (check.version !== version || check.goLiveDate !== goLiveDate || check.branchId !== branchId)
  const amountsOk = cash !== null && bank !== null
  const canGoLive = !!result && !stale && result.problems.length === 0 && amountsOk && !busy && !finished && !!branchId
  const currentStep = editingAnswers || !answers ? 0 : !result ? 1 : finished ? 3 : result.problems.length > 0 || stale ? 2 : 3

  const stepLabels: Record<GoLiveStep, string> = {
    suppliers: t("live.stepSuppliers"),
    customers: t("live.stepCustomers"),
    stock: t("live.stepStock"),
    balances: t("live.stepBalances"),
  }

  return (
    <div className="space-y-6">
      <Stepper current={currentStep} done={finished} />

      {opening.data?.isSet && !finished && (
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4" role="status">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">{t("live.alreadyDoneTitle", { date: opening.data.openingDate ? ` · ${opening.data.openingDate}` : "" })}</p>
            <p className="text-muted-foreground">{t("live.alreadyDoneBody")}</p>
          </div>
        </div>
      )}

      {editingAnswers || !answers ? (
        <GoLiveQuestions
          initial={answers}
          onDone={(next) => {
            storeAnswers(next)
            setAnswers(next)
            setEditingAnswers(false)
          }}
        />
      ) : (
        <>
          <GoLiveAnswers options={answers} onChange={() => setEditingAnswers(true)} disabled={!!busy} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("prepare.title")}</CardTitle>
              <CardDescription>{t("prepare.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="go-live-date">{t("prepare.date")}</Label>
                  <DatePicker id="go-live-date" value={goLiveDate} onChange={(v) => v && setGoLiveDate(v)} disabled={!!busy} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="go-live-cash">{t("prepare.cash")}</Label>
                  <Input
                    id="go-live-cash"
                    inputMode="decimal"
                    placeholder="0"
                    value={cashText}
                    onChange={(e) => setCashText(e.target.value)}
                    disabled={!!busy}
                    aria-invalid={cash === null}
                    aria-describedby="go-live-cash-hint"
                  />
                  <p id="go-live-cash-hint" className="text-xs text-muted-foreground">
                    {t("prepare.cashHint")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="go-live-bank">{t("prepare.bank")}</Label>
                  <Input
                    id="go-live-bank"
                    inputMode="decimal"
                    placeholder="0"
                    value={bankText}
                    onChange={(e) => setBankText(e.target.value)}
                    disabled={!!busy}
                    aria-invalid={bank === null}
                    aria-describedby="go-live-bank-hint"
                  />
                  <p id="go-live-bank-hint" className="text-xs text-muted-foreground">
                    {t("prepare.bankHint")}
                  </p>
                </div>
              </div>

              <Guide options={answers} />

              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() =>
                      void downloadWorkbook("go-live-setup.xlsx", goLiveTemplateSheets(answers)).catch(() =>
                        toast({ title: t("live.downloadFail"), variant: "destructive" }),
                      )
                    }
                  >
                    <Download aria-hidden /> {t("prepare.download")}
                  </Button>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={answers.detail === "full"}
                      onCheckedChange={(on) => {
                        const next: GoLiveTemplateOptions = { ...answers, detail: on ? "full" : "simple" }
                        storeAnswers(next)
                        setAnswers(next)
                      }}
                      aria-label={t("prepare.moreColumns")}
                    />
                    <span className="text-muted-foreground">{t("prepare.moreColumns")}</span>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">{t("prepare.downloadHint")}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".xlsx,.xls"
                    className="sr-only"
                    id="go-live-file"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                  <Button onClick={() => fileInput.current?.click()} disabled={!!busy}>
                    {busy === "reading" ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} {t("prepare.upload")}
                  </Button>
                  {fileName && (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <FileSpreadsheet className="h-4 w-4" aria-hidden /> {fileName}
                    </span>
                  )}
                  {sheets && (
                    <Button variant="outline" onClick={() => sheetsRef.current && void runCheck(sheetsRef.current, version)} disabled={!!busy}>
                      {busy === "checking" ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} {t("prepare.checkAgain")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t("prepare.nothingSavedYet")}</p>
              </div>
              <p className="text-sm text-muted-foreground">{t("prepare.inParts")}</p>
            </CardContent>
          </Card>

          {result && sheets && (
            <Card className={cn(result.problems.length > 0 && "border-destructive/40")}>
              <CardHeader>
                <CardTitle className="text-base">{t("review.title")}</CardTitle>
                {stale && <CardDescription className="text-warning">{t("review.stale")}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-5">
                <GoLiveSummary check={result} cash={cash ?? 0} bank={bank ?? 0} />
                <GoLiveProblems check={result} sheets={sheets} busy={!!busy} onFix={editCell} onDownload={downloadProblems} />
              </CardContent>
            </Card>
          )}

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("live.title")}</CardTitle>
                <CardDescription>{t("live.description")}</CardDescription>
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
                        <span>{stepLabels[s]}</span>
                        {steps[s] === "skipped" && <Badge variant="outline">{t("live.nothingToSave")}</Badge>}
                      </li>
                    ))}
                  </ol>
                )}
                {runError && (
                  <p className="text-sm text-destructive" role="alert">
                    {t("live.stopped", { error: runError })}
                  </p>
                )}
                {finished ? (
                  <div className="space-y-1" role="status">
                    <p className="flex items-center gap-2 text-sm font-medium text-success">
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> {t("live.done")}
                    </p>
                    <p className="text-sm text-muted-foreground">{t("live.doneHint")}</p>
                  </div>
                ) : (
                  <Button onClick={() => setConfirming(true)} disabled={!canGoLive}>
                    {busy === "saving" ? <Loader2 className="animate-spin" aria-hidden /> : <Rocket aria-hidden />}{" "}
                    {runError ? t("live.continue") : t("live.button")}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {result && (
        <ConfirmDialog
          isOpen={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => void goLive()}
          variant="default"
          title={t("live.confirmTitle")}
          description={
            <span className="space-y-2">
              <span className="block">
                {t("live.confirmBody", {
                  lines: result.stock.rows,
                  value: formatCurrency(result.stock.value),
                  cards: result.stock.cardsOnly,
                  date: goLiveDate,
                })}
              </span>
              {opening.data?.isSet && (
                <span className="block font-medium text-warning">{t("live.confirmAgain", { date: opening.data.openingDate ?? "" })}</span>
              )}
            </span>
          }
          confirmText={t("live.confirm")}
          cancelText={t("live.cancel")}
        />
      )}
    </div>
  )
}
