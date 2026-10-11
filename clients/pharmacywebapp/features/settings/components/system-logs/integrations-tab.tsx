"use client"

import { useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ArrowRightLeft, FileText, RefreshCw, Search, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  integrationShortType,
  listIntegrationEvents,
  listIrdQueue,
  systemLogsErrorMessage,
} from "@/lib/api/system-logs-dotnet"
import type { LogSelection } from "./log-detail-sheet"
import {
  ClickableRow,
  FilterBar,
  FilterField,
  formatDuration,
  formatFullTime,
  formatRelative,
  formatTime,
  IntegrationStatusBadge,
  IrdStatusBadge,
  LogTable,
  PagerBar,
  presetWindow,
  Td,
  Th,
  WindowSelect,
  type WindowPreset,
} from "./shared"

type Source = "bus" | "ird"

export function IntegrationsTab({
  tenantId,
  canViewIrd,
  onOpen,
}: {
  tenantId?: string
  canViewIrd: boolean
  onOpen: (s: LogSelection) => void
}) {
  const [source, setSource] = useState<Source>("bus")

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-muted-foreground">
          <span className="font-medium text-foreground">Internal event bus and external dispatch.</span>{" "}
          Event bus rows are integration events one module publishes for others (e.g. a completed sale → accounting
          voucher, customer loyalty, webhooks), delivered through the transactional outbox. IRD dispatch is the queue that
          sends e-invoices to the tax authority (CBMS).
        </p>
        {canViewIrd ? (
          <div role="tablist" aria-label="Integration source" className="inline-flex shrink-0 rounded-md border bg-background p-0.5">
            {(
              [
                ["bus", "Event bus", ArrowRightLeft],
                ["ird", "IRD dispatch", FileText],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={source === value}
                onClick={() => setSource(value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  source === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {source === "bus" || !canViewIrd ? <EventBusList tenantId={tenantId} onOpen={onOpen} /> : <IrdQueueList onOpen={onOpen} />}
    </div>
  )
}

interface BusFilters {
  preset: WindowPreset
  status?: string
  search: string
}

function EventBusList({ tenantId, onOpen }: { tenantId?: string; onOpen: (s: LogSelection) => void }) {
  const [state, setState] = useState<{ filters: BusFilters; page: number; pageSize: number }>({
    filters: { preset: "7d", search: "" },
    page: 1,
    pageSize: 50,
  })
  const [searchDraft, setSearchDraft] = useState("")
  const setFilter = (patch: Partial<BusFilters>) =>
    setState((s) => ({ ...s, filters: { ...s.filters, ...patch }, page: 1 }))

  const { filters, page, pageSize } = state
  const query = useQuery({
    queryKey: ["system-logs", "integration-events", tenantId ?? null, filters, page, pageSize],
    queryFn: () =>
      listIntegrationEvents({
        ...presetWindow(filters.preset, Date.now()),
        tenantId,
        status: filters.status,
        search: filters.search || undefined,
        pageNumber: page,
        pageSize,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
  const rows = query.data?.items ?? []

  return (
    <>
      <FilterBar>
        <WindowSelect id="bus-window" value={filters.preset} onChange={(preset) => setFilter({ preset })} />
        <FilterField label="Status" htmlFor="bus-status">
          <Select value={filters.status ?? "ANY"} onValueChange={(v) => setFilter({ status: v === "ANY" ? undefined : v })}>
            <SelectTrigger id="bus-status" className="w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any status</SelectItem>
              <SelectItem value="Processed">Processed</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Failed">Failed (retrying)</SelectItem>
              <SelectItem value="Dead">Dead (gave up)</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Search" htmlFor="bus-search">
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
              id="bus-search"
              className="w-full pl-8 sm:w-72"
              placeholder="Event name, correlation id, error — Enter"
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
          title="Couldn't load integration events"
          message={systemLogsErrorMessage(query.error, "Failed to load the event bus log.")}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={Workflow}
          title="No integration events in this window"
          description="Events appear when a module publishes one — e.g. completing a sale, issuing a token or receiving stock."
        />
      ) : (
        <>
          <LogTable
            caption="Integration events, most recent first"
            head={
              <>
                <Th>Created</Th>
                <Th>Event</Th>
                <Th>Status</Th>
                <Th className="text-right">Retries</Th>
                <Th>Delivered</Th>
                <Th className="min-w-[12rem]">Last error</Th>
                <Th>Correlation</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </>
            }
          >
            {rows.map((r) => {
              const lag =
                r.processedOnUtc != null
                  ? new Date(r.processedOnUtc).getTime() - new Date(r.createdOnUtc).getTime()
                  : null
              const name = integrationShortType(r)
              return (
                <ClickableRow
                  key={r.id}
                  label={`Details for ${name} event at ${formatTime(r.createdOnUtc)}`}
                  onOpen={() => onOpen({ kind: "integration", id: r.id })}
                  tone={r.status === "Dead" ? "danger" : r.status === "Failed" ? "warning" : undefined}
                >
                  <Td className="num whitespace-nowrap font-mono text-xs text-muted-foreground" title={formatFullTime(r.createdOnUtc)}>
                    {formatTime(r.createdOnUtc)}
                  </Td>
                  <Td title={r.type}>
                    <span className="font-medium">{name}</span>
                    {r.module ? <span className="ml-1.5 text-xs text-muted-foreground">{r.module}</span> : null}
                  </Td>
                  <Td>
                    <IntegrationStatusBadge status={r.status} />
                  </Td>
                  <Td className="num text-right font-mono text-xs">{r.retryCount}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted-foreground" title={formatFullTime(r.processedOnUtc)}>
                    {lag != null ? `after ${formatDuration(Math.max(0, lag))}` : r.nextRetryAt ? `retry ${formatRelative(r.nextRetryAt)}` : "—"}
                  </Td>
                  <Td className="max-w-[18rem]" title={r.lastError ?? undefined}>
                    <span className="block truncate text-xs text-destructive">{r.lastError ?? ""}</span>
                  </Td>
                  <Td className="max-w-[9rem]" title={r.correlationId ?? undefined}>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{r.correlationId ?? "—"}</span>
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
    </>
  )
}

function IrdQueueList({ onOpen }: { onOpen: (s: LogSelection) => void }) {
  const [state, setState] = useState<{ status?: string; page: number; pageSize: number }>({ page: 1, pageSize: 50 })
  const query = useQuery({
    queryKey: ["system-logs", "ird-queue", state],
    queryFn: () => listIrdQueue({ status: state.status, pageNumber: state.page, pageSize: state.pageSize }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
  const rows = query.data?.items ?? []

  return (
    <>
      <FilterBar>
        <FilterField label="Status" htmlFor="ird-status">
          <Select
            value={state.status ?? "ANY"}
            onValueChange={(v) => setState((s) => ({ ...s, status: v === "ANY" ? undefined : v, page: 1 }))}
          >
            <SelectTrigger id="ird-status" className="w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Processing">Processing</SelectItem>
              <SelectItem value="Sent">Sent</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <Button variant="outline" size="sm" className="lg:ml-auto" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden />
          Refresh
        </Button>
      </FilterBar>

      {query.isLoading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : query.isError ? (
        <ErrorState
          size="compact"
          title="Couldn't load the IRD queue"
          message={systemLogsErrorMessage(query.error, "Failed to load IRD dispatch rows.")}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={FileText}
          title="Nothing queued for IRD"
          description="Sales are queued here when they are sent to the tax authority's e-invoice (CBMS) endpoint."
        />
      ) : (
        <>
          <LogTable
            caption="IRD dispatch queue, most recent first"
            head={
              <>
                <Th>Queued</Th>
                <Th>Sale</Th>
                <Th>Status</Th>
                <Th className="text-right">Attempts</Th>
                <Th>Next attempt</Th>
                <Th className="min-w-[14rem]">Last error</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </>
            }
          >
            {rows.map((r) => (
              <ClickableRow
                key={r.id}
                label={`Details for IRD dispatch of sale ${r.saleId}`}
                onOpen={() => onOpen({ kind: "ird", item: r })}
                tone={r.status === "Failed" ? "danger" : undefined}
              >
                <Td className="num whitespace-nowrap font-mono text-xs text-muted-foreground" title={formatFullTime(r.createdAtUtc)}>
                  {formatTime(r.createdAtUtc)}
                </Td>
                <Td className="font-mono text-xs" title={r.saleId}>
                  {r.saleId.slice(0, 8)}…
                </Td>
                <Td>
                  <IrdStatusBadge status={r.status} />
                </Td>
                <Td className="num text-right font-mono text-xs">{r.attempts}</Td>
                <Td className="num whitespace-nowrap text-xs text-muted-foreground">{r.nextAttemptAtUtc ? formatTime(r.nextAttemptAtUtc) : "—"}</Td>
                <Td className="max-w-[20rem]" title={r.lastError ?? undefined}>
                  <span className="block truncate text-xs text-destructive">{r.lastError ?? ""}</span>
                </Td>
              </ClickableRow>
            ))}
          </LogTable>
          <PagerBar
            page={query.data}
            pageSize={state.pageSize}
            isFetching={query.isFetching}
            onPageChange={(p) => setState((s) => ({ ...s, page: p }))}
            onPageSizeChange={(size) => setState((s) => ({ ...s, pageSize: size, page: 1 }))}
          />
        </>
      )}
    </>
  )
}
