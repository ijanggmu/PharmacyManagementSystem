"use client"

import { useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Globe, RefreshCw, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  HTTP_METHODS,
  listActivity,
  systemLogsErrorMessage,
  type StatusClass,
} from "@/lib/api/system-logs-dotnet"
import type { LogSelection } from "./log-detail-sheet"
import {
  ClickableRow,
  DurationCell,
  FilterBar,
  FilterField,
  formatFullTime,
  formatTime,
  LogTable,
  MethodBadge,
  PagerBar,
  presetWindow,
  StatusBadge,
  Td,
  Th,
  WindowSelect,
  type WindowPreset,
} from "./shared"

interface Filters {
  preset: WindowPreset
  method?: string
  statusClass?: StatusClass
  search: string
  minDurationMs?: number
}

const DEFAULT_FILTERS: Filters = { preset: "24h", search: "" }
const AUTO_REFRESH_MS = 15_000

export function ApiRequestsTab({ tenantId, onOpen }: { tenantId?: string; onOpen: (s: LogSelection) => void }) {
  // Filters and page live in one state object so a filter change resets the page atomically
  // (no stale-page fetch).
  const [state, setState] = useState<{ filters: Filters; page: number; pageSize: number }>({
    filters: DEFAULT_FILTERS,
    page: 1,
    pageSize: 50,
  })
  const [searchDraft, setSearchDraft] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(false)

  const setFilter = (patch: Partial<Filters>) =>
    setState((s) => ({ ...s, filters: { ...s.filters, ...patch }, page: 1 }))

  const { filters, page, pageSize } = state
  const query = useQuery({
    queryKey: ["system-logs", "activity", tenantId ?? null, filters, page, pageSize],
    queryFn: () =>
      listActivity({
        ...presetWindow(filters.preset, Date.now()),
        tenantId,
        method: filters.method,
        statusClass: filters.statusClass,
        search: filters.search || undefined,
        minDurationMs: filters.minDurationMs,
        pageNumber: page,
        pageSize,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: autoRefresh ? AUTO_REFRESH_MS : false,
    staleTime: 10_000,
  })

  const hasFilters = Boolean(filters.method || filters.statusClass || filters.search || filters.minDurationMs)
  const rows = query.data?.items ?? []

  return (
    <div className="space-y-3">
      <FilterBar>
        <WindowSelect id="req-window" value={filters.preset} onChange={(preset) => setFilter({ preset })} />
        <FilterField label="Method" htmlFor="req-method">
          <Select value={filters.method ?? "ANY"} onValueChange={(v) => setFilter({ method: v === "ANY" ? undefined : v })}>
            <SelectTrigger id="req-method" className="w-full sm:w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any</SelectItem>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Status" htmlFor="req-status">
          <Select
            value={filters.statusClass ?? "ANY"}
            onValueChange={(v) => setFilter({ statusClass: v === "ANY" ? undefined : (v as StatusClass) })}
          >
            <SelectTrigger id="req-status" className="w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any status</SelectItem>
              <SelectItem value="error">Errors (4xx + 5xx)</SelectItem>
              <SelectItem value="2xx">2xx success</SelectItem>
              <SelectItem value="3xx">3xx redirect</SelectItem>
              <SelectItem value="4xx">4xx client error</SelectItem>
              <SelectItem value="5xx">5xx server error</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Latency" htmlFor="req-latency">
          <Select
            value={filters.minDurationMs ? String(filters.minDurationMs) : "ANY"}
            onValueChange={(v) => setFilter({ minDurationMs: v === "ANY" ? undefined : Number(v) })}
          >
            <SelectTrigger id="req-latency" className="w-full sm:w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any</SelectItem>
              <SelectItem value="250">≥ 250 ms</SelectItem>
              <SelectItem value="500">≥ 500 ms</SelectItem>
              <SelectItem value="1000">≥ 1 s (slow)</SelectItem>
              <SelectItem value="3000">≥ 3 s</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Search" htmlFor="req-search">
          <form
            className="relative"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setFilter({ search: searchDraft.trim() })
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="req-search"
              className="w-full pl-8 sm:w-64"
              placeholder="Path, user, IP — press Enter"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onBlur={() => searchDraft.trim() !== filters.search && setFilter({ search: searchDraft.trim() })}
            />
          </form>
        </FilterField>
        <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchDraft("")
                setState((s) => ({ ...s, filters: { ...DEFAULT_FILTERS, preset: s.filters.preset }, page: 1 }))
              }}
            >
              <X className="h-4 w-4" aria-hidden />
              Clear
            </Button>
          ) : null}
          <div className="flex items-center gap-2">
            <Switch id="req-auto" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="req-auto" className="text-xs">
              Auto-refresh 15s
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh requests">
            <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden />
            Refresh
          </Button>
        </div>
      </FilterBar>

      <p className="sr-only" aria-live="polite">
        {query.isFetching ? "Loading requests" : query.data ? `${query.data.totalCount} requests` : ""}
      </p>

      {query.isLoading ? (
        <SkeletonTable rows={10} cols={8} />
      ) : query.isError ? (
        <ErrorState
          size="compact"
          title="Couldn't load API requests"
          message={systemLogsErrorMessage(query.error, "Failed to load the request log.")}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={Globe}
          title={hasFilters ? "No requests match these filters" : "No API requests in this window"}
          description={
            hasFilters
              ? "Try a wider time range or clear the filters."
              : "Requests appear here as soon as the API serves them (health checks and docs are excluded)."
          }
        />
      ) : (
        <>
          <LogTable
            caption="API requests, most recent first"
            head={
              <>
                <Th>Time</Th>
                <Th>Method</Th>
                <Th className="min-w-[16rem]">Path</Th>
                <Th>Status</Th>
                <Th className="text-right">Duration</Th>
                <Th>User</Th>
                <Th>IP</Th>
                <Th>Source</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </>
            }
          >
            {rows.map((r) => {
              const code = r.statusCode ?? 0
              return (
                <ClickableRow
                  key={r.id}
                  label={`Details for ${r.method ?? ""} ${r.path ?? "request"} at ${formatTime(r.occurredAtUtc)}`}
                  onOpen={() => onOpen({ kind: "audit", id: r.id, tenantId })}
                  tone={code >= 500 ? "danger" : code >= 400 && code !== 499 ? "warning" : undefined}
                >
                  <Td className="num whitespace-nowrap font-mono text-xs text-muted-foreground" title={formatFullTime(r.occurredAtUtc)}>
                    {formatTime(r.occurredAtUtc)}
                  </Td>
                  <Td>
                    <MethodBadge method={r.method} />
                  </Td>
                  <Td className="max-w-[28rem]" title={r.routeTemplate ?? undefined}>
                    <span className="block truncate font-mono text-xs">
                      {r.path ?? "—"}
                      {r.queryString ? <span className="text-muted-foreground">{r.queryString}</span> : null}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge code={r.statusCode} />
                  </Td>
                  <Td className="text-right">
                    <DurationCell ms={r.durationMs} />
                  </Td>
                  <Td className="max-w-[10rem]" title={r.userId ?? undefined}>
                    <span className="block truncate text-xs">{r.userName || (r.userId ? r.userId.slice(0, 8) : "anonymous")}</span>
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.clientIp ?? "—"}</Td>
                  <Td className="max-w-[12rem]" title={r.source ?? undefined}>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{r.source ?? "—"}</span>
                  </Td>
                </ClickableRow>
              )
            })}
          </LogTable>
          <PagerBar
            page={query.data}
            pageSize={pageSize}
            isFetching={query.isFetching}
            onPageChange={(p) => setState((s) => ({ ...s, page: p }))}
            onPageSizeChange={(size) => setState((s) => ({ ...s, pageSize: size, page: 1 }))}
          />
        </>
      )}
    </div>
  )
}
