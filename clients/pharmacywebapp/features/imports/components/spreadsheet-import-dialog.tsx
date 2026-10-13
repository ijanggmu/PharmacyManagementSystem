"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, Upload } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import {
  downloadWorkbook,
  readSpreadsheetFile,
  templateSheets,
  type ImportColumn,
  type MappedRow,
  type ParsedSheet,
} from "@/features/imports/lib/spreadsheet"
import {
  buildPreviewRows,
  countPreview,
  errorReportRows,
  importFingerprint,
  type PreviewRow,
} from "@/features/imports/lib/import-report"
import { IMPORT_MAX_ROWS, type ImportResult } from "@/features/imports/types"

/** Rows drawn in the preview table at once (the error report always has all of them). */
const PREVIEW_LIMIT = 300

export interface SpreadsheetImportDialogProps<T, O> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Short name for file names and the idempotency fingerprint ("customers"). */
  kind: string
  /** Noun for counts ("customer", "supplier", "stock line"). */
  noun: string
  columns: ImportColumn[]
  /** Column keys shown in the preview table, in order. */
  previewKeys: string[]
  examples: (string | number)[][]
  notes: string[]
  mapRows: (rows: ParsedSheet["rows"]) => MappedRow<T>[]
  defaultOptions: O
  renderOptions: (options: O, setOptions: (options: O) => void, disabled: boolean) => ReactNode
  submit: (rows: T[], options: O, dryRun: boolean, idempotencyKey?: string) => Promise<ImportResult>
  /** After a committed import (invalidate lists, etc.). */
  onImported?: (result: ImportResult) => void
  /** Extra lines for the final summary (e.g. stock value). */
  summaryExtra?: (result: ImportResult) => ReactNode
}

interface LoadedFile<T> {
  name: string
  sheet: ParsedSheet
  mapped: MappedRow<T>[]
}

const STATUS_BADGE: Record<PreviewRow["status"], { label: string; variant: "success" | "info" | "muted" | "danger" | "outline" }> = {
  created: { label: "New", variant: "success" },
  received: { label: "Receive", variant: "success" },
  updated: { label: "Update", variant: "info" },
  skipped: { label: "Skip", variant: "muted" },
  failed: { label: "Error", variant: "danger" },
  pending: { label: "Not checked", variant: "outline" },
}

/**
 * The shared import flow: download the template (data + Instructions sheet) → upload a file → it's parsed in the
 * browser and checked by the server (a dry run, nothing saved) → the preview shows every row's outcome with errors
 * highlighted → Import commits the whole file at once (all-or-nothing, with an Idempotency-Key) → summary with a
 * downloadable report of the rows that had problems or notes.
 */
export function SpreadsheetImportDialog<T, O>(props: SpreadsheetImportDialogProps<T, O>) {
  const { open, onOpenChange, title, description, kind, noun, columns, previewKeys, examples, notes, mapRows } = props
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const keyTracker = useRef(createIdempotencyKeyTracker())

  const [file, setFile] = useState<LoadedFile<T> | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [options, setOptionsState] = useState<O>(props.defaultOptions)
  const [checked, setChecked] = useState<{ result: ImportResult; fingerprint: string } | null>(null)
  const [finalResult, setFinalResult] = useState<ImportResult | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)

  const rows = useMemo(() => file?.mapped.map((m) => m.data) ?? [], [file])
  const fingerprint = useMemo(() => importFingerprint(kind, rows, options), [kind, rows, options])
  const stale = checked !== null && checked.fingerprint !== fingerprint

  const preview = useMemo(
    () => (file ? buildPreviewRows(file.mapped, stale ? null : (checked?.result ?? null)) : []),
    [file, checked, stale],
  )
  const counts = countPreview(preview)
  const labelOf = useMemo(() => new Map(columns.map((c) => [c.key, c.label])), [columns])

  const check = useMutation({
    mutationFn: (arg: { rows: T[]; options: O; fingerprint: string }) => props.submit(arg.rows, arg.options, true),
    onSuccess: (result, arg) => setChecked({ result, fingerprint: arg.fingerprint }),
    onError: (error) => toast({ title: "Could not check the file", description: apiRequestErrorMessage(error), variant: "destructive" }),
  })

  const commit = useMutation({
    mutationFn: (arg: { rows: T[]; options: O; fingerprint: string; idempotencyKey: string }) =>
      props.submit(arg.rows, arg.options, false, arg.idempotencyKey),
    onSuccess: (result, arg) => {
      if (result.committed) {
        keyTracker.current.reset()
        setFinalResult(result)
        props.onImported?.(result)
        toast({ title: "Import complete", description: summaryLine(result, noun) })
      } else {
        // Something changed since the check (e.g. a customer added meanwhile): show the new errors, nothing was saved.
        setChecked({ result, fingerprint: arg.fingerprint })
        toast({ title: "Nothing was imported", description: "Some rows have problems now. Fix them and try again.", variant: "destructive" })
      }
    },
    onError: (error) => toast({ title: "Import failed", description: apiRequestErrorMessage(error), variant: "destructive" }),
  })

  const busy = check.isPending || commit.isPending

  const reset = () => {
    setFile(null)
    setFileError(null)
    setChecked(null)
    setFinalResult(null)
    setOnlyProblems(false)
    setOptionsState(props.defaultOptions)
    keyTracker.current.reset()
  }

  const close = (next: boolean) => {
    if (busy) return
    if (!next) reset()
    onOpenChange(next)
  }

  const setOptions = (next: O) => setOptionsState(next)

  const runCheck = (loaded: LoadedFile<T>, nextOptions: O) => {
    const data = loaded.mapped.map((m) => m.data)
    check.mutate({ rows: data, options: nextOptions, fingerprint: importFingerprint(kind, data, nextOptions) })
  }

  const handleFile = async (selected: File) => {
    setFileError(null)
    setChecked(null)
    setFinalResult(null)
    try {
      const sheet = await readSpreadsheetFile(selected, columns)
      if (sheet.missingColumns.length > 0) {
        setFile(null)
        setFileError(`Missing column(s): ${sheet.missingColumns.join(", ")}. Download the template to see the expected headers.`)
        return
      }
      if (sheet.rows.length === 0) {
        setFile(null)
        setFileError("The file has no data rows under the header.")
        return
      }
      if (sheet.rows.length > IMPORT_MAX_ROWS) {
        setFile(null)
        setFileError(`The file has ${sheet.rows.length.toLocaleString()} rows — at most ${IMPORT_MAX_ROWS.toLocaleString()} per file. Split it into several files.`)
        return
      }
      const loaded: LoadedFile<T> = { name: selected.name, sheet, mapped: mapRows(sheet.rows) }
      setFile(loaded)
      runCheck(loaded, options)
    } catch (error) {
      setFile(null)
      setFileError(error instanceof Error ? error.message : "Could not read that file.")
    }
  }

  const downloadTemplate = () =>
    void downloadWorkbook(`${kind}-import-template.xlsx`, templateSheets(columns, examples, notes)).catch(() =>
      toast({ title: "Could not create the template", variant: "destructive" }),
    )

  const downloadReport = () => {
    if (!file) return
    const base = file.name.replace(/\.[^.]+$/, "")
    void downloadWorkbook(`${base}-import-report.xlsx`, [{ name: "Report", rows: errorReportRows(columns, file.sheet.rows, preview) }])
  }

  const startImport = () => {
    if (!file) return
    commit.mutate({ rows, options, fingerprint, idempotencyKey: keyTracker.current.keyFor(fingerprint) })
  }

  const visible = (onlyProblems ? preview.filter((p) => p.errors.length > 0 || p.warnings.length > 0) : preview).slice(0, PREVIEW_LIMIT)
  const rawByRow = useMemo(() => new Map(file?.sheet.rows.map((r) => [r.rowNumber, r.cells]) ?? []), [file])
  const hasNotes = preview.some((p) => p.errors.length > 0 || p.warnings.length > 0)
  const canImport = !!file && !!checked && !stale && counts.failed === 0 && counts.pending === 0 && !busy

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogScrollBody className="space-y-4 py-4">
          {finalResult ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden />
                <div className="space-y-1">
                  <p className="font-medium">Imported {file?.name}</p>
                  <p className="text-sm text-muted-foreground">{summaryLine(finalResult, noun)}</p>
                  {props.summaryExtra?.(finalResult)}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={kind === "stock" ? "Received" : "Created"} value={finalResult.created} />
                <Stat label="Updated" value={finalResult.updated} />
                <Stat label="Skipped" value={finalResult.skipped} />
                <Stat label="Failed" value={finalResult.failed} />
              </dl>
              {hasNotes && (
                <Button variant="outline" onClick={downloadReport}>
                  <Download aria-hidden />
                  Download report (skipped rows and notes)
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <FileSpreadsheet className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-sm font-medium">{file ? file.name : "Upload an Excel or CSV file"}</p>
                    <p className="text-sm text-muted-foreground">
                      {file
                        ? `${file.sheet.rows.length.toLocaleString()} row(s) read.`
                        : `Use the template — it has an Instructions sheet. Up to ${IMPORT_MAX_ROWS.toLocaleString()} rows per file.`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={downloadTemplate}>
                    <Download aria-hidden />
                    Template
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="sr-only"
                    onChange={(event) => {
                      const selected = event.target.files?.[0]
                      event.target.value = ""
                      if (selected) void handleFile(selected)
                    }}
                  />
                  <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                    <Upload aria-hidden />
                    {file ? "Choose another file" : "Choose file"}
                  </Button>
                </div>
              </div>

              {fileError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {fileError}
                </p>
              )}

              <div className="rounded-lg border p-4">{props.renderOptions(options, setOptions, busy)}</div>

              {file && (
                <div className="space-y-3">
                  {file.sheet.unknownHeaders.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Ignored column(s): {file.sheet.unknownHeaders.join(", ")}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
                      {check.isPending ? (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking with the server…
                        </span>
                      ) : stale || !checked ? (
                        <span className="text-muted-foreground">Options changed — check the file again.</span>
                      ) : (
                        <>
                          <Badge variant="success">{counts.ready} ready</Badge>
                          {counts.failed > 0 && <Badge variant="danger">{counts.failed} with errors</Badge>}
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch id={`${kind}-only-problems`} checked={onlyProblems} onCheckedChange={setOnlyProblems} />
                        <Label htmlFor={`${kind}-only-problems`} className="text-sm">Only rows with problems</Label>
                      </div>
                      {(stale || !checked) && !check.isPending && (
                        <Button size="sm" variant="outline" onClick={() => runCheck(file, options)} disabled={busy}>
                          <RefreshCw aria-hidden />
                          Check again
                        </Button>
                      )}
                      {hasNotes && (
                        <Button size="sm" variant="outline" onClick={downloadReport}>
                          <Download aria-hidden />
                          Error report
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">Row</TableHead>
                          <TableHead className="w-28">Status</TableHead>
                          {previewKeys.map((key) => (
                            <TableHead key={key}>{labelOf.get(key) ?? key}</TableHead>
                          ))}
                          <TableHead className="min-w-64">Problems / notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((row) => {
                          const cells = rawByRow.get(row.rowNumber) ?? {}
                          const badge = STATUS_BADGE[row.status]
                          const errorFields = new Set(row.errors.map((e) => e.field))
                          return (
                            <TableRow key={row.rowNumber} className={cn(row.status === "failed" && "bg-destructive/5")}>
                              <TableCell className="num text-muted-foreground">{row.rowNumber}</TableCell>
                              <TableCell>
                                <Badge variant={badge.variant}>{badge.label}</Badge>
                              </TableCell>
                              {previewKeys.map((key) => (
                                <TableCell
                                  key={key}
                                  className={cn("max-w-48 truncate", errorFields.has(key) && "font-medium text-destructive underline decoration-dotted")}
                                  title={cells[key]}
                                >
                                  {cells[key] || <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              ))}
                              <TableCell className="text-sm">
                                {row.label && <p className="text-muted-foreground">{row.label}</p>}
                                {row.errors.map((e, i) => (
                                  <p key={`e${i}`} className="text-destructive">
                                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                                    {labelOf.get(e.field) ?? e.field}: {e.message}
                                  </p>
                                ))}
                                {row.warnings.map((w, i) => (
                                  <p key={`w${i}`} className="text-muted-foreground">{w}</p>
                                ))}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {preview.length > PREVIEW_LIMIT && (
                    <p className="text-xs text-muted-foreground">
                      Showing the first {PREVIEW_LIMIT} rows. The error report has every row with a problem.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </DialogScrollBody>

        <DialogStickyFooter>
          {finalResult ? (
            <>
              <Button variant="outline" onClick={reset}>Import another file</Button>
              <Button onClick={() => close(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)} disabled={busy}>Cancel</Button>
              <Button onClick={startImport} disabled={!canImport}>
                {commit.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {counts.failed > 0 ? `Fix ${counts.failed} row(s) to import` : `Import ${counts.ready.toLocaleString()} row(s)`}
              </Button>
            </>
          )}
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num text-xl font-semibold">{value.toLocaleString()}</dd>
    </div>
  )
}

export function summaryLine(result: ImportResult, noun: string): string {
  const parts = [`${result.created} ${noun}${result.created === 1 ? "" : "s"} ${noun.includes("stock") ? "received" : "created"}`]
  if (result.updated > 0) parts.push(`${result.updated} updated`)
  if (result.skipped > 0) parts.push(`${result.skipped} skipped (already on file)`)
  return parts.join(", ") + "."
}
