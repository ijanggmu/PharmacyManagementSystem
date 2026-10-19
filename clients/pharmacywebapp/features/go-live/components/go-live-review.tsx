"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pagination } from "@/components/ui/pagination"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CurrencyDisplay } from "@/components/currency-display"
import { useTranslations } from "@/lib/i18n/i18n-provider"
import type { RawImportRow } from "@/features/imports/lib/spreadsheet"
import { GO_LIVE_SHEETS, goLiveColumns, type GoLiveSection, type GoLiveSheets } from "@/features/go-live/lib/go-live-workbook"
import type { GoLiveCheck } from "@/features/go-live/lib/go-live-run"
import { PROBLEM_ROWS_PER_PAGE, groupProblems, problemPage, type ProblemGroup } from "@/features/go-live/lib/go-live-problems"

export type ReviewTab = "all" | GoLiveSection

const LABELS: Record<GoLiveSection, Map<string, string>> = {
  suppliers: new Map(goLiveColumns("suppliers").map((c) => [c.key, c.label])),
  customers: new Map(goLiveColumns("customers").map((c) => [c.key, c.label])),
  stock: new Map(goLiveColumns("stock").map((c) => [c.key, c.label])),
  balances: new Map(goLiveColumns("balances").map((c) => [c.key, c.label])),
}

/** A fix box that keeps its own text while typing and hands it over on Enter or when focus leaves, so typing never
 * re-renders the whole page. */
function FixInput({
  ariaLabel,
  placeholder,
  value,
  disabled,
  onCommit,
}: {
  ariaLabel: string
  placeholder: string
  value: string
  disabled: boolean
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <Input
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
      }}
      className="h-8 sm:max-w-56"
    />
  )
}

const ProblemRow = memo(function ProblemRow({
  group,
  row,
  editable,
  busy,
  onFix,
}: {
  group: ProblemGroup
  row: RawImportRow | undefined
  editable: boolean
  busy: boolean
  onFix?: (section: GoLiveSection, rowNumber: number, field: string, value: string) => void
}) {
  const t = useTranslations("goLive")
  return (
    <li className="space-y-2 p-3">
      <p className="text-sm">
        <span className="text-muted-foreground">
          {GO_LIVE_SHEETS[group.section]} · {t("review.row", { row: group.rowNumber })}
        </span>
        {group.label && <span className="font-medium"> · {group.label}</span>}
      </p>
      <ul className="space-y-2">
        {group.items.map((p, i) => {
          const label = LABELS[p.section].get(p.field)
          return (
            <li key={`${p.field}-${i}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{p.message}</span>
              {editable &&
                onFix &&
                (label && row ? (
                  <FixInput
                    ariaLabel={`${GO_LIVE_SHEETS[p.section]} row ${p.rowNumber}: ${label}`}
                    placeholder={label}
                    value={row.cells[p.field] ?? ""}
                    disabled={busy}
                    onCommit={(value) => onFix(p.section, p.rowNumber, p.field, value)}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">{t("review.fixInFile")}</span>
                ))}
            </li>
          )
        })}
      </ul>
    </li>
  )
})

function ProblemList({
  groups,
  rows,
  editable,
  busy,
  onFix,
}: {
  groups: ProblemGroup[]
  rows: ReadonlyMap<string, RawImportRow>
  editable: boolean
  busy: boolean
  onFix?: (section: GoLiveSection, rowNumber: number, field: string, value: string) => void
}) {
  const [page, setPage] = useState(1)
  // A new check or another tab starts again at page 1.
  useEffect(() => setPage(1), [groups])
  const { page: current, totalPages, start, items: visible } = problemPage(groups, page)
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {visible.map((g) => (
          <ProblemRow key={g.key} group={g} row={rows.get(g.key)} editable={editable} busy={busy} onFix={onFix} />
        ))}
      </ul>
      <Pagination
        currentPage={current}
        totalPages={totalPages}
        totalItems={groups.length}
        itemsPerPage={PROBLEM_ROWS_PER_PAGE}
        startIndex={start}
        onPageChange={setPage}
      />
    </div>
  )
}

/** "You'll start with …": the check's totals in the owner's words, plus what it means in the books. */
export function GoLiveSummary({ check, cash, bank }: { check: GoLiveCheck; cash: number; bank: number }) {
  const t = useTranslations("goLive")
  const { stock, suppliers, customers } = check
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t("review.startWith")}</p>
      <ul className="grid gap-2 text-sm sm:grid-cols-2" aria-label={t("review.startWith")}>
        <li className="rounded-lg border p-3">
          <span className="font-medium">{t("review.medicineLines", { count: stock.rows })}</span> · {t("review.stockWorth")}{" "}
          <CurrencyDisplay amount={stock.value} />
          {(stock.cardsOnly > 0 || stock.newMedicines > 0) && (
            <p className="text-muted-foreground">
              {[
                stock.cardsOnly > 0 ? t("review.noStock", { count: stock.cardsOnly }) : null,
                stock.newMedicines > 0 ? t("review.newMedicines", { count: stock.newMedicines }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {stock.consignedRows > 0 && <p className="text-muted-foreground">{t("review.consigned", { count: stock.consignedRows })}</p>}
        </li>
        {suppliers.count > 0 && (
          <li className="rounded-lg border p-3">
            <span className="font-medium">{t("review.suppliersOwed", { count: suppliers.count })}</span> ·{" "}
            <CurrencyDisplay amount={suppliers.owed} />
          </li>
        )}
        {customers.count > 0 && (
          <li className="rounded-lg border p-3">
            <span className="font-medium">{t("review.customersOwe", { count: customers.count })}</span> ·{" "}
            <CurrencyDisplay amount={customers.owed} />
          </li>
        )}
        <li className="rounded-lg border p-3">
          <span className="font-medium">{t("review.cash")}</span> <CurrencyDisplay amount={cash} /> ·{" "}
          <span className="font-medium">{t("review.bank")}</span> <CurrencyDisplay amount={bank} />
        </li>
      </ul>
      <p className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {t("review.books")}: {t("review.booksStock")} <CurrencyDisplay amount={stock.value} /> · {t("review.booksUdharo")}{" "}
          <CurrencyDisplay amount={customers.owed} /> · {t("review.booksOwed")} <CurrencyDisplay amount={suppliers.owed} /> ·{" "}
          {t("review.cash")} <CurrencyDisplay amount={cash} /> · {t("review.bank")} <CurrencyDisplay amount={bank} />.{" "}
          {t("review.booksCapital")}
        </span>
      </p>
    </div>
  )
}

/**
 * The check's problems, by sheet: "Fix before going live" (errors, block Go live, each with a fix box) and
 * "Please check" (warnings, saved as they are, folded away). Both lists are grouped by row and paginated.
 */
export function GoLiveProblems({
  check,
  sheets,
  busy,
  onFix,
  onDownload,
}: {
  check: GoLiveCheck
  sheets: GoLiveSheets
  busy: boolean
  onFix: (section: GoLiveSection, rowNumber: number, field: string, value: string) => void
  onDownload: () => void
}) {
  const t = useTranslations("goLive")
  const errorGroups = useMemo(() => groupProblems(check.problems), [check.problems])
  const warningGroups = useMemo(() => groupProblems(check.warnings), [check.warnings])
  const rows = useMemo(() => {
    const map = new Map<string, RawImportRow>()
    for (const section of Object.keys(sheets) as GoLiveSection[]) for (const r of sheets[section].rows) map.set(`${section}:${r.rowNumber}`, r)
    return map
  }, [sheets])

  const tabs = useMemo(() => {
    const sections = (["stock", "suppliers", "customers", "balances"] as GoLiveSection[]).filter((s) =>
      [...errorGroups, ...warningGroups].some((g) => g.section === s),
    )
    return sections.map((s) => ({
      section: s,
      errors: errorGroups.filter((g) => g.section === s).length,
      warnings: warningGroups.filter((g) => g.section === s).length,
    }))
  }, [errorGroups, warningGroups])

  const [tab, setTab] = useState<ReviewTab>("all")
  const [showWarnings, setShowWarnings] = useState(false)
  const errors = useMemo(() => errorGroups.filter((g) => tab === "all" || g.section === tab), [errorGroups, tab])
  const warnings = useMemo(() => warningGroups.filter((g) => tab === "all" || g.section === tab), [warningGroups, tab])

  if (errorGroups.length === 0 && warningGroups.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-success" role="status">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> {t("review.allGood")}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {tabs.length > 1 && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as ReviewTab)}>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="all">{t("review.all")}</TabsTrigger>
              {tabs.map((s) => (
                <TabsTrigger key={s.section} value={s.section} className="gap-1.5">
                  {GO_LIVE_SHEETS[s.section]}
                  {s.errors > 0 && <Badge variant="destructive">{s.errors}</Badge>}
                  {s.warnings > 0 && <Badge variant="outline">{s.warnings}</Badge>}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={onDownload}>
          <Download aria-hidden /> {t("review.downloadProblems")}
        </Button>
      </div>

      {errors.length > 0 && (
        <section className="space-y-2" aria-label={t("review.mustFix")}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden /> {t("review.mustFix")} ({errors.length})
          </h3>
          <p className="text-xs text-muted-foreground">{t("review.mustFixHint")}</p>
          <ProblemList groups={errors} rows={rows} editable busy={busy} onFix={onFix} />
        </section>
      )}

      {warnings.length > 0 && (
        <section className="space-y-2" aria-label={t("review.pleaseCheck")}>
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-semibold text-warning"
            aria-expanded={showWarnings}
            onClick={() => setShowWarnings((v) => !v)}
          >
            {showWarnings ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
            {t("review.pleaseCheck")} ({warnings.length}) · {showWarnings ? t("review.hide") : t("review.show")}
          </button>
          {showWarnings && (
            <>
              <p className="text-xs text-muted-foreground">{t("review.pleaseCheckHint")}</p>
              <ProblemList groups={warnings} rows={rows} editable={false} busy={busy} />
            </>
          )}
        </section>
      )}
    </div>
  )
}
