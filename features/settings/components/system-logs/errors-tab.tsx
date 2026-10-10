"use client"

import { useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { AlertTriangle, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import {
  searchExceptions,
  shortExceptionType,
  systemLogsErrorMessage,
  type AuditSeverityName,
} from "@/lib/api/system-logs-dotnet"
import type { LogSelection } from "./log-detail-sheet"
import {
  ClickableRow,
  FilterBar,
  FilterField,
  formatFullTime,
  formatTime,
  LogTable,
  PagerBar,
  presetWindow,
  SeverityBadge,
  Td,
  Th,
  WindowSelect,
  type WindowPreset,
} from "./shared"

interface Filters {
  preset: WindowPreset
  severity?: AuditSeverityName
  search: string
}

export function ErrorsTab({ tenantId, onOpen }: { tenantId?: string; onOpen: (s: LogSelection) => void }) {
  const [state, setState] = useState<{ filters: Filters; page: number; pageSize: number }>({
    filters: { preset: "7d", search: "" },
    page: 1,
    pageSize: 50,
  })
  const [searchDraft, setSearchDraft] = useState("")
  const setFilter = (patch: Partial<Filters>) =>
    setState((s) => ({ ...s, filters: { ...s.filters, ...patch }, page: 1 }))

  const { filters, page, pageSize } = state
  const query = useQuery({
    queryKey: ["system-logs", "exceptions", tenantId ?? null, filters, page, pageSize],
    queryFn: () =>
      searchExceptions({
        ...presetWindow(filters.preset, Date.now()),
        tenantId,
        severity: filters.severity,
        search: filters.search || undefined,
        pageNumber: page,
        pageSize,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
  const rows = query.data?.items ?? []

  return (
    <div className="space-y-3">
      <FilterBar>
        <WindowSelect id="err-window" value={filters.preset} onChange={(preset) => setFilter({ preset })} />
        <FilterField label="Severity" htmlFor="err-severity">
          <Select
            value={filters.severity ?? "ANY"}
            onValueChange={(v) => setFilter({ severity: v === "ANY" ? undefined : (v as AuditSeverityName) })}
          >
            <SelectTrigger id="err-severity" className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="Error">Error</SelectItem>
              <SelectItem value="Warning">Warning</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Search" htmlFor="err-search">
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
              id="err-search"
              className="w-full pl-8 sm:w-72"
              placeholder="Message, exception type, route — Enter"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onBlur={() => searchDraft.trim() !== filters.search && setFilter({ search: searchDraft.trim() })}
            />
          </form>
        </FilterField>
        <Button variant="outline" size="sm" className="lg:ml-auto" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden />
          Refresh
        </Button>
      </FilterBar>

      {query.isLoading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : query.isError ? (
        <ErrorState
          size="compact"
          title="Couldn't load errors"
          message={systemLogsErrorMessage(query.error, "Failed to load exceptions.")}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={AlertTriangle}
          title="No unhandled exceptions in this window"
          description="Server errors are recorded here with their stack trace; the failed request itself appears under API requests."
        />
      ) : (
        <>
          <LogTable
            caption="Exceptions, most recent first"
            head={
              <>
                <Th>Time</Th>
                <Th>Severity</Th>
                <Th>Type</Th>
                <Th className="min-w-[18rem]">Message</Th>
                <Th>Route</Th>
                <Th>User</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </>
            }
          >
            {rows.map((r) => (
              <ClickableRow
                key={r.id}
                label={`Details for ${shortExceptionType(r.exceptionType)} at ${formatTime(r.occurredAtUtc)}`}
                onOpen={() => onOpen({ kind: "audit", id: r.id, tenantId })}
              >
                <Td className="num whitespace-nowrap font-mono text-xs text-muted-foreground" title={formatFullTime(r.occurredAtUtc)}>
                  {formatTime(r.occurredAtUtc)}
                </Td>
                <Td>
                  <SeverityBadge severity={r.severity} />
                </Td>
                <Td className="whitespace-nowrap font-mono text-xs font-medium text-destructive" title={r.exceptionType ?? undefined}>
                  {shortExceptionType(r.exceptionType)}
                </Td>
                <Td className="max-w-[28rem]" title={r.message ?? undefined}>
                  <span className="line-clamp-2 text-xs">{r.message || "—"}</span>
                </Td>
                <Td className="max-w-[16rem]" title={r.routeOrLocation ?? undefined}>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{r.routeOrLocation ?? "—"}</span>
                </Td>
                <Td className="max-w-[9rem]">
                  <span className="block truncate text-xs">{r.userName || "—"}</span>
                </Td>
              </ClickableRow>
            ))}
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
