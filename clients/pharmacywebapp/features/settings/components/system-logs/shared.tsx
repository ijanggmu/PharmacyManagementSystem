"use client"

import { useCallback, useId, useState, type ReactNode } from "react"
import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  severityName,
  statusText,
  statusTone,
  type DotnetEnum,
  type DotnetPagedResponse,
} from "@/lib/api/system-logs-dotnet"

// ---------------------------------------------------------------------------
// Time windows
// ---------------------------------------------------------------------------

export type WindowPreset = "15m" | "1h" | "24h" | "7d" | "30d" | "90d"

export const WINDOW_PRESETS: ReadonlyArray<{ value: WindowPreset; label: string; ms: number }> = [
  { value: "15m", label: "Last 15 minutes", ms: 15 * 60 * 1000 },
  { value: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { value: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { value: "90d", label: "Last 90 days", ms: 90 * 24 * 60 * 60 * 1000 },
]

/** Resolves a preset to an ISO window ending now. `now` is passed in so callers control re-evaluation. */
export function presetWindow(preset: WindowPreset, now: number): { fromUtc: string; toUtc: string } {
  const ms = WINDOW_PRESETS.find((p) => p.value === preset)?.ms ?? WINDOW_PRESETS[2].ms
  return { fromUtc: new Date(now - ms).toISOString(), toUtc: new Date(now).toISOString() }
}

export function WindowSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: WindowPreset
  onChange: (value: WindowPreset) => void
}) {
  return (
    <FilterField label="Time range" htmlFor={id}>
      <Select value={value} onValueChange={(v) => onChange(v as WindowPreset)}>
        <SelectTrigger id={id} className="w-full sm:w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WINDOW_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  )
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : timeFormatter.format(d)
}

export function formatFullTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
}

export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return ""
  const diff = now - new Date(iso).getTime()
  if (Number.isNaN(diff)) return ""
  const s = Math.round(diff / 1000)
  if (s < 60) return `${Math.max(0, s)}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—"
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  return `${ms} ms`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const SLOW_MS = 1000

// ---------------------------------------------------------------------------
// Badges (always text + colour; never colour alone)
// ---------------------------------------------------------------------------

const METHOD_STYLES: Record<string, string> = {
  GET: "border-info/25 bg-info/10 text-info",
  POST: "border-success/25 bg-success/10 text-success",
  PUT: "border-warning/30 bg-warning/10 text-warning",
  PATCH: "border-warning/30 bg-warning/10 text-warning",
  DELETE: "border-destructive/25 bg-destructive/10 text-destructive",
}

export function MethodBadge({ method }: { method: string | null | undefined }) {
  const m = (method ?? "").toUpperCase()
  return (
    <span
      className={cn(
        "inline-flex min-w-[3.25rem] justify-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide",
        METHOD_STYLES[m] ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {m || "—"}
    </span>
  )
}

export function StatusBadge({ code }: { code: number | null | undefined }) {
  return (
    <Badge variant={statusTone(code)} className="num font-mono">
      {statusText(code)}
    </Badge>
  )
}

export function SeverityBadge({ severity }: { severity: DotnetEnum | null | undefined }) {
  const name = severityName(severity)
  const variant =
    name === "Critical" || name === "Error"
      ? "danger"
      : name === "Warning"
        ? "warning"
        : name === "Information"
          ? "info"
          : "muted"
  return <Badge variant={variant}>{name === "Information" ? "Info" : name}</Badge>
}

export function IntegrationStatusBadge({ status }: { status: string }) {
  const variant = status === "Processed" ? "success" : status === "Failed" ? "warning" : status === "Dead" ? "danger" : "muted"
  return <Badge variant={variant}>{status}</Badge>
}

export function IrdStatusBadge({ status }: { status: string }) {
  const variant = status === "Sent" ? "success" : status === "Failed" ? "danger" : status === "Processing" ? "info" : "muted"
  return <Badge variant={variant}>{status}</Badge>
}

export function DurationCell({ ms }: { ms: number | null | undefined }) {
  const slow = (ms ?? 0) >= SLOW_MS
  return (
    <span className={cn("num whitespace-nowrap font-mono text-xs", slow ? "font-semibold text-warning" : "text-foreground")}>
      {formatDuration(ms)}
      {slow ? <span className="sr-only"> (slow)</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Copy-to-clipboard
// ---------------------------------------------------------------------------

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [value])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function FilterField({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
      {children}
    </div>
  )
}

/** Dense, sticky-header table wrapper; scrolls horizontally on narrow screens. */
export function LogTable({ head, children, caption }: { head: ReactNode; children: ReactNode; caption: string }) {
  return (
    <div className="max-h-[620px] overflow-auto rounded-lg border">
      <table className="min-w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">{head}</tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  )
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-3 py-2 font-medium", className)}>
      {children}
    </th>
  )
}

/**
 * Row that opens the details drawer: the whole row is a mouse target, and a trailing "Details"
 * button keeps it keyboard / screen-reader reachable without breaking table semantics.
 */
export function ClickableRow({
  onOpen,
  label,
  children,
  tone,
}: {
  onOpen: () => void
  label: string
  children: ReactNode
  tone?: "danger" | "warning"
}) {
  return (
    <tr
      onClick={onOpen}
      className={cn(
        "cursor-pointer align-middle transition-colors duration-150 hover:bg-muted/60 focus-within:bg-muted/60",
        tone === "danger" && "bg-destructive/[0.04]",
        tone === "warning" && "bg-warning/[0.04]",
      )}
    >
      {children}
      <td className="px-2 py-1 text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
        >
          Details
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </td>
    </tr>
  )
}

export function Td({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <td className={cn("px-3 py-2", className)} title={title}>
      {children}
    </td>
  )
}

export function PagerBar<T>({
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  isFetching,
}: {
  page: DotnetPagedResponse<T> | undefined
  onPageChange: (page: number) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  isFetching?: boolean
}) {
  return (
    <Pager
      pageNumber={page?.pageNumber ?? 1}
      totalPages={page?.totalPages ?? 1}
      totalCount={page?.totalCount ?? 0}
      pageSize={page?.pageSize ?? pageSize}
      itemCount={page?.items.length ?? 0}
      isFetching={isFetching}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  )
}

export function Pager({
  pageNumber,
  totalPages,
  totalCount,
  pageSize,
  itemCount,
  isFetching,
  onPageChange,
  onPageSizeChange,
}: {
  pageNumber: number
  totalPages: number
  totalCount: number
  pageSize: number
  itemCount: number
  isFetching?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const sizeId = useId()
  const current = Math.max(1, pageNumber)
  const pages = Math.max(1, totalPages)
  const start = totalCount === 0 ? 0 : (current - 1) * pageSize + 1
  const end = totalCount === 0 ? 0 : Math.min(totalCount, start + itemCount - 1)

  return (
    <div className="flex flex-col gap-2 pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="num text-muted-foreground" aria-live="polite">
        {totalCount === 0 ? "No results" : `${start.toLocaleString()}–${end.toLocaleString()} of ${totalCount.toLocaleString()}`}
        {isFetching ? <span className="ml-2 text-xs">Updating…</span> : null}
      </p>
      <div className="flex items-center gap-2">
        <Label htmlFor={sizeId} className="sr-only">
          Rows per page
        </Label>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger id={sizeId} className="h-8 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[25, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => onPageChange(current - 1)} disabled={current <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span className="num min-w-[4.5rem] text-center text-xs text-muted-foreground">
          {current} / {pages}
        </span>
        <Button variant="outline" size="sm" onClick={() => onPageChange(current + 1)} disabled={current >= pages} aria-label="Next page">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

/** Collapsible, scrollable JSON block. */
export function JsonBlock({ value, label, defaultOpen = false }: { value: unknown; label: string; defaultOpen?: boolean }) {
  const text = value === undefined || value === null ? null : JSON.stringify(value, null, 2)
  return (
    <details className="group rounded-md border bg-muted/30" open={defaultOpen}>
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
        <span>{label}</span>
        {text ? <CopyButton value={text} label={label} /> : <span className="text-[11px]">empty</span>}
      </summary>
      {text ? (
        <pre className="max-h-72 overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
          {text}
        </pre>
      ) : null}
    </details>
  )
}
