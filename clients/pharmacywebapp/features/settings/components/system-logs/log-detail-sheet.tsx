"use client"

import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, ArrowRight, Database, GitBranch, Globe, KeyRound, Link2, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ErrorState } from "@/components/ui/error-state"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  auditTagNames,
  eventTypeName,
  getAuditDetail,
  getIntegrationEvent,
  listByCorrelation,
  shortExceptionType,
  systemLogsErrorMessage,
  type AuditDetail,
  type AuditEventTypeName,
  type AuditSummaryEntry,
  type IntegrationEventDetail,
  type IrdQueueItem,
} from "@/lib/api/system-logs-dotnet"
import {
  CopyButton,
  DurationCell,
  formatBytes,
  formatFullTime,
  formatRelative,
  formatTime,
  IntegrationStatusBadge,
  IrdStatusBadge,
  JsonBlock,
  MethodBadge,
  SeverityBadge,
  StatusBadge,
} from "./shared"

export type LogSelection =
  | { kind: "audit"; id: string; tenantId?: string }
  | { kind: "integration"; id: string }
  | { kind: "ird"; item: IrdQueueItem }

const EVENT_TYPE_META: Record<AuditEventTypeName, { label: string; icon: typeof Globe }> = {
  Activity: { label: "API request", icon: Globe },
  Exception: { label: "Exception", icon: AlertTriangle },
  Security: { label: "Security", icon: KeyRound },
  EntityChange: { label: "Entity change", icon: Database },
  None: { label: "Event", icon: Workflow },
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** Two-column definition list. Rows with an empty value are skipped. */
function Fields({ rows }: { rows: Array<[string, ReactNode, string?]> }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== "")
  if (visible.length === 0) return <p className="text-xs text-muted-foreground">Nothing recorded.</p>
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1.5 text-sm">
      {visible.map(([label, value, copy]) => (
        <div key={label} className="contents">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 break-all">{value}</span>
            {copy ? <CopyButton value={copy} label={label} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v)
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null
}

function DetailSkeleton() {
  return (
    <div className="space-y-5 p-4" aria-busy="true" aria-label="Loading details">
      <Skeleton className="h-6 w-2/3" />
      <SkeletonText lines={4} />
      <Skeleton className="h-32 w-full" />
      <SkeletonText lines={3} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Type-specific payload sections
// ---------------------------------------------------------------------------

function ActivitySection({ p }: { p: Record<string, unknown> }) {
  const status = asNumber(p.statusCode)
  return (
    <>
      <Section title="Request">
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <MethodBadge method={asString(p.method)} />
          <span className="min-w-0 break-all font-mono text-xs">
            {asString(p.name)}
            <span className="text-muted-foreground">{asString(p.queryString)}</span>
          </span>
        </div>
        <Fields
          rows={[
            ["Status", <StatusBadge key="s" code={status} />],
            ["Duration", <DurationCell key="d" ms={asNumber(p.durationMs)} />],
            ["Route", asString(p.routeTemplate) ? <Mono>{asString(p.routeTemplate)}</Mono> : null],
            ["Client IP", asString(p.clientIp) ? <Mono>{asString(p.clientIp)}</Mono> : null, asString(p.clientIp) ?? undefined],
            ["User agent", asString(p.userAgent)],
            ["Request size", formatBytes(asNumber(p.requestSize))],
            ["Response size", formatBytes(asNumber(p.responseSize))],
            ["Failed with", asString(p.errorType) ? <Mono>{shortExceptionType(asString(p.errorType))}</Mono> : null],
          ]}
        />
        {!asString(p.method) ? (
          <p className="text-xs text-muted-foreground">
            Recorded before method / IP / route capture was added — those fields are unavailable for this entry.
          </p>
        ) : null}
      </Section>
      <Section title="Bodies (masked)">
        <div className="space-y-2">
          <JsonBlock label="Request body" value={p.requestPreview} />
          <JsonBlock label="Response body" value={p.responsePreview} />
        </div>
      </Section>
    </>
  )
}

function SecuritySection({ p }: { p: Record<string, unknown> }) {
  const claims = (p.claimsSnapshot ?? null) as Record<string, unknown> | null
  return (
    <>
      <Section title="Security event">
        <Fields
          rows={[
            ["Action", asString(p.action) ? <Badge variant="info">{asString(p.action)}</Badge> : null],
            ["Auth method", asString(p.authMethod)],
            ["Reason", asString(p.reasonCode)],
            ["Subject", asString(p.subjectId) ? <Mono>{asString(p.subjectId)}</Mono> : null, asString(p.subjectId) ?? undefined],
            ["Client", asString(p.clientId)],
            ["IP", claims && asString(claims.ip) ? <Mono>{asString(claims.ip)}</Mono> : null],
            ["User agent", claims ? asString(claims.userAgent) : null],
          ]}
        />
      </Section>
      {claims ? (
        <Section title="Claims snapshot">
          <JsonBlock label="Claims" value={claims} defaultOpen />
        </Section>
      ) : null}
    </>
  )
}

function ExceptionSection({ p }: { p: Record<string, unknown> }) {
  const frames = Array.isArray(p.stackTop) ? (p.stackTop as unknown[]).map(String) : []
  return (
    <>
      <Section title="Exception">
        <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
          <p className="font-mono text-xs font-semibold text-destructive">{asString(p.exceptionType)}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{asString(p.message) ?? "No message"}</p>
        </div>
        <Fields
          rows={[
            ["Area", asString(p.area)],
            ["Route / location", asString(p.routeOrLocation) ? <Mono>{asString(p.routeOrLocation)}</Mono> : null],
          ]}
        />
      </Section>
      {frames.length > 0 ? (
        <Section title={`Stack (top ${frames.length} frames)`}>
          <ol className="max-h-72 space-y-1 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
            {frames.map((f, i) => {
              const own = f.includes("FSH.") && !f.includes("System.")
              return (
                <li key={i} className={cn("break-all", own ? "text-foreground" : "text-muted-foreground")}>
                  <span className="num mr-2 select-none text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  {f}
                </li>
              )
            })}
          </ol>
        </Section>
      ) : null}
      {p.data ? (
        <Section title="Exception data">
          <JsonBlock label="Data" value={p.data} />
        </Section>
      ) : null}
    </>
  )
}

interface PropertyChange {
  name: string
  dataType?: string | null
  oldValue?: unknown
  newValue?: unknown
  isSensitive?: boolean
}

function EntityChangeSection({ p }: { p: Record<string, unknown> }) {
  const changes = Array.isArray(p.changes) ? (p.changes as PropertyChange[]) : []
  return (
    <>
      <Section title="Entity">
        <Fields
          rows={[
            ["Operation", asString(p.operation) ? <Badge variant="info">{asString(p.operation)}</Badge> : null],
            ["Table", asString(p.table) ? <Mono>{[asString(p.schema), asString(p.table)].filter(Boolean).join(".")}</Mono> : null],
            ["Entity", asString(p.entityName)],
            ["Key", asString(p.key) ? <Mono>{asString(p.key)}</Mono> : null, asString(p.key) ?? undefined],
            ["Transaction", asString(p.transactionId) ? <Mono>{asString(p.transactionId)}</Mono> : null],
          ]}
        />
      </Section>
      <Section title={`Changes (${changes.length})`}>
        {changes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No per-property diff (set-based or bulk change).</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-xs">
              <caption className="sr-only">Property changes, old to new</caption>
              <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2 py-1.5 font-medium">Field</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Old</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">New</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {changes.map((c) => (
                  <tr key={c.name} className="align-top">
                    <td className="px-2 py-1.5 font-mono font-medium">
                      {c.name}
                      {c.isSensitive ? <span className="ml-1 text-[10px] text-muted-foreground">(masked)</span> : null}
                    </td>
                    <td className="max-w-[12rem] break-all px-2 py-1.5 font-mono text-destructive/90 line-through decoration-destructive/40">
                      {asString(c.oldValue) ?? <span className="text-muted-foreground no-underline">∅</span>}
                    </td>
                    <td className="max-w-[12rem] break-all px-2 py-1.5 font-mono text-success">
                      {asString(c.newValue) ?? <span className="text-muted-foreground">∅</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Related events timeline
// ---------------------------------------------------------------------------

function RelatedEvents({
  correlationId,
  currentId,
  tenantId,
  onSelect,
}: {
  correlationId: string
  currentId: string
  tenantId?: string
  onSelect: (selection: LogSelection) => void
}) {
  const related = useQuery({
    queryKey: ["system-logs", "correlation", correlationId, tenantId ?? null],
    queryFn: () => listByCorrelation(correlationId, tenantId),
    staleTime: 30_000,
  })

  return (
    <Section title="Related events (same correlation id)">
      {related.isLoading ? (
        <SkeletonText lines={3} />
      ) : related.isError ? (
        <p className="text-xs text-destructive">{systemLogsErrorMessage(related.error, "Couldn't load related events.")}</p>
      ) : (related.data ?? []).length <= 1 ? (
        <p className="text-xs text-muted-foreground">No other events share this correlation id.</p>
      ) : (
        <ol className="relative space-y-1 border-l pl-4">
          {(related.data ?? []).map((e: AuditSummaryEntry) => {
            const type = eventTypeName(e.eventType)
            const meta = EVENT_TYPE_META[type]
            const Icon = meta.icon
            const isCurrent = e.id === currentId
            return (
              <li key={e.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[1.4rem] top-2.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                    type === "Exception" ? "bg-destructive" : type === "Security" ? "bg-info" : type === "EntityChange" ? "bg-success" : "bg-primary",
                  )}
                  aria-hidden
                />
                <button
                  type="button"
                  disabled={isCurrent}
                  onClick={() => onSelect({ kind: "audit", id: e.id, tenantId })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-150",
                    isCurrent ? "bg-primary/10 font-medium" : "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="num w-[5.5rem] shrink-0 font-mono text-muted-foreground">{formatTime(e.occurredAtUtc).split(", ").pop()}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {meta.label}
                    {e.source ? <span className="text-muted-foreground"> · {e.source}</span> : null}
                  </span>
                  {isCurrent ? (
                    <span className="text-[10px] uppercase text-primary">this</span>
                  ) : (
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Audit record body
// ---------------------------------------------------------------------------

function AuditDetailBody({
  detail,
  tenantId,
  onSelect,
}: {
  detail: AuditDetail
  tenantId?: string
  onSelect: (selection: LogSelection) => void
}) {
  const type = eventTypeName(detail.eventType)
  const p = (detail.payload ?? {}) as Record<string, unknown>
  const tags = auditTagNames(detail.tags)

  return (
    <div className="space-y-6">
      <Section title="Context">
        <Fields
          rows={[
            ["Occurred", <span key="o" className="num">{formatFullTime(detail.occurredAtUtc)} <span className="text-muted-foreground">({formatRelative(detail.occurredAtUtc)})</span></span>],
            ["Received", <span key="r" className="num">{formatFullTime(detail.receivedAtUtc)}</span>],
            ["Severity", <SeverityBadge key="sev" severity={detail.severity} />],
            ["Tenant", detail.tenantId ? <Mono>{detail.tenantId}</Mono> : null],
            ["User", detail.userName || detail.userId ? <span>{detail.userName ?? "—"} {detail.userId ? <Mono>({detail.userId})</Mono> : null}</span> : null, detail.userId ?? undefined],
            ["Source", detail.source ? <Mono>{detail.source}</Mono> : null],
            ["Correlation", detail.correlationId ? <Mono>{detail.correlationId}</Mono> : null, detail.correlationId ?? undefined],
            ["Trace", detail.traceId ? <Mono>{detail.traceId}</Mono> : null, detail.traceId ?? undefined],
            ["Span", detail.spanId ? <Mono>{detail.spanId}</Mono> : null, detail.spanId ?? undefined],
            ["Request", detail.requestId ? <Mono>{detail.requestId}</Mono> : null, detail.requestId ?? undefined],
            ["Tags", tags.length ? <span className="flex flex-wrap gap-1">{tags.map((t) => <Badge key={t} variant="muted">{t}</Badge>)}</span> : null],
          ]}
        />
      </Section>

      {type === "Activity" ? <ActivitySection p={p} /> : null}
      {type === "Security" ? <SecuritySection p={p} /> : null}
      {type === "Exception" ? <ExceptionSection p={p} /> : null}
      {type === "EntityChange" ? <EntityChangeSection p={p} /> : null}

      {detail.correlationId ? (
        <RelatedEvents correlationId={detail.correlationId} currentId={detail.id} tenantId={tenantId} onSelect={onSelect} />
      ) : null}

      <Section title="Raw payload">
        <JsonBlock label="Full payload JSON (masked)" value={p} />
      </Section>
    </div>
  )
}

function AuditDetailView({
  id,
  tenantId,
  onSelect,
}: {
  id: string
  tenantId?: string
  onSelect: (selection: LogSelection) => void
}) {
  const q = useQuery({
    queryKey: ["system-logs", "audit", id, tenantId ?? null],
    queryFn: () => getAuditDetail(id, tenantId),
    staleTime: 5 * 60_000,
  })

  if (q.isLoading) return <DetailSkeleton />
  if (q.isError || !q.data)
    return (
      <ErrorState
        size="compact"
        title="Couldn't load this entry"
        message={systemLogsErrorMessage(q.error, "Failed to load the audit entry.")}
        onRetry={() => q.refetch()}
        retrying={q.isFetching}
      />
    )

  const type = eventTypeName(q.data.eventType)
  const meta = EVENT_TYPE_META[type]
  const Icon = meta.icon
  const p = (q.data.payload ?? {}) as Record<string, unknown>
  const title =
    type === "Activity"
      ? `${asString(p.method) ?? ""} ${asString(p.name) ?? "Request"}`.trim()
      : type === "Exception"
        ? shortExceptionType(asString(p.exceptionType))
        : type === "Security"
          ? asString(p.action) ?? "Security event"
          : type === "EntityChange"
            ? `${asString(p.operation) ?? "Change"} · ${asString(p.table) ?? asString(p.entityName) ?? ""}`
            : "Audit event"

  return (
    <>
      <SheetHeader className="border-b pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden />
          <span>{meta.label}</span>
          <span aria-hidden>·</span>
          <span className="num">{formatFullTime(q.data.occurredAtUtc)}</span>
        </div>
        <SheetTitle className="break-all pr-8 font-display text-base leading-snug">{title}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={q.data.severity} />
          {type === "Activity" ? <StatusBadge code={asNumber(p.statusCode)} /> : null}
          <span className="font-mono text-[11px]">{q.data.id}</span>
          <CopyButton value={q.data.id} label="event id" />
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-4">
        <AuditDetailBody detail={q.data} tenantId={tenantId} onSelect={onSelect} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Integration event body
// ---------------------------------------------------------------------------

function IntegrationDetailView({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["system-logs", "integration", id],
    queryFn: () => getIntegrationEvent(id),
    staleTime: 30_000,
  })

  if (q.isLoading) return <DetailSkeleton />
  if (q.isError || !q.data)
    return (
      <ErrorState
        size="compact"
        title="Couldn't load this event"
        message={systemLogsErrorMessage(q.error, "Failed to load the integration event.")}
        onRetry={() => q.refetch()}
        retrying={q.isFetching}
      />
    )

  const e: IntegrationEventDetail = q.data
  return (
    <>
      <SheetHeader className="border-b pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Workflow className="h-4 w-4" aria-hidden />
          <span>Integration event{e.module ? ` · published by ${e.module}` : ""}</span>
        </div>
        <SheetTitle className="font-display text-base">{e.shortType}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-1.5">
          <IntegrationStatusBadge status={e.status} />
          <span className="font-mono text-[11px]">{e.id}</span>
          <CopyButton value={e.id} label="event id" />
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <Section title="Dispatch">
          <Fields
            rows={[
              ["Created", <span key="c" className="num">{formatFullTime(e.createdOnUtc)}</span>],
              ["Processed", e.processedOnUtc ? <span className="num">{formatFullTime(e.processedOnUtc)}</span> : <span className="text-muted-foreground">Not yet</span>],
              ["Retries", <span key="r" className="num">{e.retryCount}</span>],
              ["Next retry", e.nextRetryAt ? <span className="num">{formatFullTime(e.nextRetryAt)}</span> : null],
              ["Claimed by", e.claimedBy ? <Mono>{e.claimedBy}</Mono> : null],
              ["Lease until", e.claimedUntilUtc ? <span className="num">{formatFullTime(e.claimedUntilUtc)}</span> : null],
              ["Tenant", e.tenantId ? <Mono>{e.tenantId}</Mono> : null],
              ["Correlation", e.correlationId ? <Mono>{e.correlationId}</Mono> : null, e.correlationId ?? undefined],
              ["CLR type", <Mono key="t">{e.type.split(",")[0]}</Mono>],
            ]}
          />
          {e.lastError ? (
            <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3" role="note">
              <p className="text-xs font-semibold text-destructive">Last error</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">{e.lastError}</pre>
            </div>
          ) : null}
        </Section>

        <Section title={`Consumers (${e.consumers.length})`}>
          {e.consumers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {e.status === "Processed"
                ? "Dispatched, but no idempotent (inbox) handler recorded consuming it."
                : "No handler has consumed this event yet."}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {e.consumers.map((c) => (
                <li key={c.handlerName} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono font-medium" title={c.handlerName}>
                      {c.handlerShortName}
                    </p>
                    {c.module ? <p className="text-muted-foreground">{c.module} module</p> : null}
                  </div>
                  <span className="num shrink-0 text-muted-foreground">{formatTime(c.processedOnUtc)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Payload (masked)">
          <JsonBlock label="Event payload JSON" value={e.payload} defaultOpen />
        </Section>
      </div>
    </>
  )
}

function IrdDetailView({ item }: { item: IrdQueueItem }) {
  return (
    <>
      <SheetHeader className="border-b pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link2 className="h-4 w-4" aria-hidden />
          <span>IRD e-invoice dispatch</span>
        </div>
        <SheetTitle className="font-display text-base">Sale {item.saleId.slice(0, 8)}…</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-1.5">
          <IrdStatusBadge status={item.status} />
          <span className="font-mono text-[11px]">{item.id}</span>
          <CopyButton value={item.id} label="queue id" />
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <Section title="Dispatch">
          <Fields
            rows={[
              ["Sale", <Mono key="s">{item.saleId}</Mono>, item.saleId],
              ["Attempts", <span key="a" className="num">{item.attempts}</span>],
              ["Queued", <span key="q" className="num">{formatFullTime(item.createdAtUtc)}</span>],
              ["Updated", <span key="u" className="num">{formatFullTime(item.updatedAtUtc)}</span>],
              ["Next attempt", item.nextAttemptAtUtc ? <span className="num">{formatFullTime(item.nextAttemptAtUtc)}</span> : null],
            ]}
          />
          {item.lastError ? (
            <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3" role="note">
              <p className="text-xs font-semibold text-destructive">Last error</p>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px]">{item.lastError}</pre>
            </div>
          ) : null}
        </Section>
      </div>
    </>
  )
}

export function LogDetailSheet({
  selection,
  onSelect,
  onClose,
}: {
  selection: LogSelection | null
  onSelect: (selection: LogSelection) => void
  onClose: () => void
}) {
  return (
    <Sheet open={selection !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl lg:max-w-2xl">
        {selection?.kind === "audit" ? (
          <AuditDetailView key={selection.id} id={selection.id} tenantId={selection.tenantId} onSelect={onSelect} />
        ) : selection?.kind === "integration" ? (
          <IntegrationDetailView key={selection.id} id={selection.id} />
        ) : selection?.kind === "ird" ? (
          <IrdDetailView item={selection.item} />
        ) : (
          <SheetHeader>
            <SheetTitle>Details</SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}
