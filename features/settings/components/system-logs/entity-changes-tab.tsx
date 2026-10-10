"use client"

import { useState } from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Database, ExternalLink, RefreshCw, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { listAuditLogs } from "@/lib/api/reports-api"
import { systemLogsErrorMessage } from "@/lib/api/system-logs-dotnet"
import type { LogSelection } from "./log-detail-sheet"
import {
  ClickableRow,
  FilterBar,
  FilterField,
  formatFullTime,
  formatTime,
  LogTable,
  Pager,
  presetWindow,
  Td,
  Th,
  WindowSelect,
  type WindowPreset,
} from "./shared"

export function entityActionVariant(action: string | null): "success" | "info" | "danger" | "warning" | "muted" {
  switch ((action ?? "").toUpperCase()) {
    case "INSERT":
      return "success"
    case "UPDATE":
      return "info"
    case "DELETE":
    case "BULKDELETE":
      return "danger"
    case "SOFTDELETE":
    case "BULKUPDATE":
      return "warning"
    default:
      return "muted"
  }
}

interface Filters {
  preset: WindowPreset
  table: string
  action?: string
}

/**
 * Entity-level audit trail (who changed which row), same data as Reports → Audit logs. Own tenant by
 * default; pass `tenantId` to read one other tenant (root support desk — tenant details, system logs).
 */
export function EntityChangesTab({
  onOpen,
  hideReportLink = false,
  tenantId,
}: {
  onOpen: (s: LogSelection) => void
  hideReportLink?: boolean
  tenantId?: string
}) {
  const [state, setState] = useState<{ filters: Filters; page: number; pageSize: number }>({
    filters: { preset: "7d", table: "" },
    page: 1,
    pageSize: 50,
  })
  const [tableDraft, setTableDraft] = useState("")
  const setFilter = (patch: Partial<Filters>) =>
    setState((s) => ({ ...s, filters: { ...s.filters, ...patch }, page: 1 }))

  const { filters, page, pageSize } = state
  const query = useQuery({
    queryKey: ["system-logs", "entity-changes", tenantId ?? null, filters, page, pageSize],
    queryFn: () => {
      const w = presetWindow(filters.preset, Date.now())
      return listAuditLogs({
        page,
        limit: pageSize,
        from: w.fromUtc,
        to: w.toUtc,
        table: filters.table || undefined,
        action: filters.action,
        tenantId,
      })
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
  const rows = query.data?.rows ?? []
  const meta = query.data?.meta

  return (
    <div className="space-y-3">
      <FilterBar>
        <WindowSelect id="ent-window" value={filters.preset} onChange={(preset) => setFilter({ preset })} />
        <FilterField label="Table" htmlFor="ent-table">
          <form
            className="relative"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setFilter({ table: tableDraft.trim() })
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="ent-table"
              className="w-full pl-8 sm:w-56"
              placeholder="Table or entity, e.g. sale — Enter"
              value={tableDraft}
              onChange={(e) => setTableDraft(e.target.value)}
              onBlur={() => tableDraft.trim() !== filters.table && setFilter({ table: tableDraft.trim() })}
            />
          </form>
        </FilterField>
        <FilterField label="Operation" htmlFor="ent-action">
          <Select value={filters.action ?? "ANY"} onValueChange={(v) => setFilter({ action: v === "ANY" ? undefined : v })}>
            <SelectTrigger id="ent-action" className="w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any</SelectItem>
              <SelectItem value="Insert">Insert</SelectItem>
              <SelectItem value="Update">Update</SelectItem>
              <SelectItem value="Delete">Delete</SelectItem>
              <SelectItem value="SoftDelete">Soft delete</SelectItem>
              <SelectItem value="Restore">Restore</SelectItem>
              <SelectItem value="BulkUpdate">Bulk update</SelectItem>
              <SelectItem value="BulkDelete">Bulk delete</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <div className="flex items-center gap-2 lg:ml-auto">
          {hideReportLink ? null : (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/reports/audit-logs">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Audit log report
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden />
            Refresh
          </Button>
        </div>
      </FilterBar>

      {query.isLoading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : query.isError ? (
        <ErrorState
          size="compact"
          title="Couldn't load entity changes"
          message={systemLogsErrorMessage(query.error, "Failed to load entity changes.")}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={Database}
          title="No entity changes for these filters"
          description="Every create, update and delete saved through the API is recorded here with a field-level diff."
        />
      ) : (
        <>
          <LogTable
            caption="Entity changes, most recent first"
            head={
              <>
                <Th>Time</Th>
                <Th>Operation</Th>
                <Th>Table</Th>
                <Th>Record</Th>
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
                label={`Details for ${r.action ?? "change"} on ${r.table_name ?? "record"}`}
                onOpen={() => onOpen({ kind: "audit", id: r.id, tenantId })}
              >
                <Td className="num whitespace-nowrap font-mono text-xs text-muted-foreground" title={formatFullTime(r.created_at)}>
                  {formatTime(r.created_at)}
                </Td>
                <Td>
                  <Badge variant={entityActionVariant(r.action)}>{r.action ?? "—"}</Badge>
                </Td>
                <Td className="font-mono text-xs">{r.table_name ?? "—"}</Td>
                <Td className="max-w-[16rem]" title={r.record_id ?? undefined}>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{r.record_id ?? "—"}</span>
                </Td>
                <Td className="max-w-[10rem]" title={r.user_id ?? undefined}>
                  <span className="block truncate font-mono text-xs">{r.user_id ? r.user_id.slice(0, 8) : "system"}</span>
                </Td>
              </ClickableRow>
            ))}
          </LogTable>
          <Pager
            pageNumber={meta?.page ?? page}
            totalPages={meta?.totalPages ?? 1}
            totalCount={meta?.total ?? rows.length}
            pageSize={pageSize}
            itemCount={rows.length}
            isFetching={query.isFetching}
            onPageChange={(p) => setState((s) => ({ ...s, page: p }))}
            onPageSizeChange={(size) => setState((s) => ({ ...s, pageSize: size, page: 1 }))}
          />
        </>
      )}
    </div>
  )
}
