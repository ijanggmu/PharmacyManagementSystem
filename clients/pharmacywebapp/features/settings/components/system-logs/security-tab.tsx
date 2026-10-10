"use client"

import { useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { KeyRound, RefreshCw, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import {
  SECURITY_ACTIONS,
  searchSecurityAudits,
  systemLogsErrorMessage,
  type SecurityAction,
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
  Td,
  Th,
  WindowSelect,
  type WindowPreset,
} from "./shared"

export const SECURITY_ACTION_LABELS: Record<SecurityAction, string> = {
  LoginSucceeded: "Login succeeded",
  LoginFailed: "Login failed",
  TokenIssued: "Token issued",
  TokenRevoked: "Token revoked",
  PasswordChanged: "Password changed",
  RoleAssigned: "Role assigned",
  RoleRevoked: "Role revoked",
  PermissionDenied: "Permission denied",
  PolicyFailed: "Policy failed",
  ImpersonationStarted: "Impersonation started",
  ImpersonationEnded: "Impersonation ended",
}

export function securityActionVariant(action: string | null): "success" | "warning" | "danger" | "info" | "muted" {
  switch (action) {
    case "LoginSucceeded":
    case "TokenIssued":
      return "success"
    case "LoginFailed":
    case "PermissionDenied":
    case "PolicyFailed":
      return "danger"
    case "ImpersonationStarted":
    case "ImpersonationEnded":
    case "RoleAssigned":
    case "RoleRevoked":
    case "PasswordChanged":
      return "warning"
    case "TokenRevoked":
      return "info"
    default:
      return "muted"
  }
}

interface Filters {
  preset: WindowPreset
  action?: SecurityAction
  search: string
}

export function SecurityTab({ tenantId, onOpen }: { tenantId?: string; onOpen: (s: LogSelection) => void }) {
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
    queryKey: ["system-logs", "security", tenantId ?? null, filters, page, pageSize],
    queryFn: () =>
      searchSecurityAudits({
        ...presetWindow(filters.preset, Date.now()),
        tenantId,
        action: filters.action,
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
        <WindowSelect id="sec-window" value={filters.preset} onChange={(preset) => setFilter({ preset })} />
        <FilterField label="Event" htmlFor="sec-action">
          <Select
            value={filters.action ?? "ANY"}
            onValueChange={(v) => setFilter({ action: v === "ANY" ? undefined : (v as SecurityAction) })}
          >
            <SelectTrigger id="sec-action" className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any event</SelectItem>
              {SECURITY_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {SECURITY_ACTION_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Search" htmlFor="sec-search">
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
              id="sec-search"
              className="w-full pl-8 sm:w-64"
              placeholder="User, reason, exact IP — Enter"
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
          title="Couldn't load the access log"
          message={systemLogsErrorMessage(query.error, "Failed to load security events.")}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={KeyRound}
          title="No security events for these filters"
          description="Sign-ins, token issuance, role and password changes, permission denials and impersonation appear here."
        />
      ) : (
        <>
          <LogTable
            caption="Security events, most recent first"
            head={
              <>
                <Th>Time</Th>
                <Th>Event</Th>
                <Th>User</Th>
                <Th>Reason</Th>
                <Th>Method</Th>
                <Th>IP</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </>
            }
          >
            {rows.map((r) => (
              <ClickableRow
                key={r.id}
                label={`Details for ${r.action ?? "security event"} at ${formatTime(r.occurredAtUtc)}`}
                onOpen={() => onOpen({ kind: "audit", id: r.id, tenantId })}
                tone={securityActionVariant(r.action) === "danger" ? "danger" : undefined}
              >
                <Td className="num whitespace-nowrap font-mono text-xs text-muted-foreground" title={formatFullTime(r.occurredAtUtc)}>
                  {formatTime(r.occurredAtUtc)}
                </Td>
                <Td>
                  <Badge variant={securityActionVariant(r.action)}>
                    {r.action ? SECURITY_ACTION_LABELS[r.action as SecurityAction] ?? r.action : "—"}
                  </Badge>
                </Td>
                <Td className="max-w-[12rem]" title={r.userId ?? undefined}>
                  <span className="block truncate text-xs">{r.userName || r.userId || "Unknown"}</span>
                </Td>
                <Td className="max-w-[12rem]" title={r.reasonCode ?? undefined}>
                  <span className="block truncate text-xs">{r.reasonCode || "—"}</span>
                </Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{r.authMethod || "—"}</Td>
                <Td className="whitespace-nowrap font-mono text-xs text-muted-foreground" title={r.userAgent ?? undefined}>
                  {r.ip || "—"}
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
