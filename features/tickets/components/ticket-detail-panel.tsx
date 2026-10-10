"use client"

import { useEffect, useRef, type ReactNode } from "react"
import Link from "next/link"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  LifeBuoy,
  Loader2,
  MessageSquare,
  Send,
  CheckCircle2,
  RotateCcw,
  Lock,
  UserCog,
  Building2,
  Eye,
  X,
  Maximize2,
} from "lucide-react"
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/tickets/ticket-badges"
import { formatDate } from "@/lib/utils/formatting"
import { cn } from "@/lib/utils"
import { NO_ASSIGNEE, useTicketDetail, type TicketDetailState } from "@/features/tickets/hooks/use-ticket-detail"
import { ticketDetailHref } from "@/features/tickets/lib/ticket-list-utils"
import type { DotnetTicketDto } from "@/lib/api/tickets-api"

export interface TicketDetailPanelProps {
  ticketId: string
  crossTenant: boolean
  /** Fired after a successful mutation (comment, assign, resolve, reopen, close). */
  onChanged?: () => void
  /** Panel variant only: renders a close button and is called when it's pressed. */
  onClose?: () => void
  /** "page" = full route layout with PageHeader; "panel" = compact master-detail pane. */
  variant: "page" | "panel"
  /** Panel variant: id for the heading, so a Sheet/region can reference it with aria-labelledby. */
  headingId?: string
}

export function TicketDetailPanel({ ticketId, crossTenant, onChanged, onClose, variant, headingId }: TicketDetailPanelProps) {
  const detail = useTicketDetail({ ticketId, crossTenant, onChanged })
  if (variant === "page") return <TicketDetailPage detail={detail} crossTenant={crossTenant} />
  return (
    <TicketDetailPane
      detail={detail}
      crossTenant={crossTenant}
      ticketId={ticketId}
      onClose={onClose}
      headingId={headingId ?? `ticket-panel-heading-${ticketId}`}
    />
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Shared blocks                                                                              */
/* ------------------------------------------------------------------------------------------ */

function ActionButtons({ detail, compact }: { detail: TicketDetailState; compact?: boolean }) {
  const { canResolve, canReopen, canClose, actionPending, handleResolve, handleReopen, handleClose } = detail
  if (!canResolve && !canReopen && !canClose) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canResolve && (
        <Button
          size={compact ? "sm" : "default"}
          onClick={() => void handleResolve()}
          disabled={actionPending !== null}
          className={cn("bg-success text-success-foreground hover:bg-success/90", compact && "h-10 sm:h-9")}
          aria-label="Resolve this ticket"
        >
          {actionPending === "resolve" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          )}
          Resolve
        </Button>
      )}
      {canReopen && (
        <Button
          size={compact ? "sm" : "default"}
          variant="outline"
          onClick={() => void handleReopen()}
          disabled={actionPending !== null}
          className={cn(compact && "h-10 sm:h-9")}
          aria-label="Reopen this ticket"
        >
          {actionPending === "reopen" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="h-4 w-4" aria-hidden />
          )}
          Reopen
        </Button>
      )}
      {canClose && (
        <Button
          size={compact ? "sm" : "default"}
          variant="secondary"
          onClick={() => void handleClose()}
          disabled={actionPending !== null}
          className={cn(compact && "h-10 sm:h-9")}
          aria-label="Close this ticket"
        >
          {actionPending === "close" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
          Close
        </Button>
      )}
    </div>
  )
}

function DescriptionBody({ ticket }: { ticket: DotnetTicketDto }) {
  return (
    <>
      {ticket.description ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{ticket.description}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No description was provided.</p>
      )}
      {ticket.resolutionNote && (
        <div className="mt-4 rounded-lg border border-success/20 bg-success/5 p-3">
          <p className="text-xs font-medium text-success">Resolution note</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{ticket.resolutionNote}</p>
        </div>
      )}
    </>
  )
}

function CommentsBody({ detail, crossTenant, idPrefix }: { detail: TicketDetailState; crossTenant: boolean; idPrefix: string }) {
  const { comments, userLabel, canComment, commentBody, setCommentBody, commentSubmitting, handleAddComment, status } = detail
  const textareaId = `${idPrefix}-comment`
  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No comments yet"
          description={canComment ? "Add the first update on this ticket." : "Updates on this ticket will appear here."}
          size="compact"
        />
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{userLabel(comment.authorUserId)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(comment.createdAtUtc, "relative")}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form
          className="space-y-2 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            void handleAddComment()
          }}
        >
          <Label htmlFor={textareaId}>Add a comment</Label>
          <Textarea
            id={textareaId}
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Share an update or ask a question"
            rows={3}
            disabled={commentSubmitting}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={commentSubmitting || !commentBody.trim()}>
              {commentSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              Post comment
            </Button>
          </div>
        </form>
      ) : crossTenant ? (
        <p className="border-t pt-4 text-xs text-muted-foreground">
          You&apos;re viewing another tenant&apos;s ticket from the support desk. Comments and status changes are made by that
          tenant&apos;s staff.
        </p>
      ) : status === "Closed" ? (
        <p className="border-t pt-4 text-xs text-muted-foreground">This ticket is closed. Reopen it to add a comment.</p>
      ) : (
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Only the person who reported this ticket and support staff can post comments on it.
        </p>
      )}
    </div>
  )
}

function DetailField({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0 space-y-1", wide && "sm:col-span-2")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  )
}

function DetailsBody({
  detail,
  crossTenant,
  idPrefix,
  layout = "stack",
}: {
  detail: TicketDetailState
  crossTenant: boolean
  idPrefix: string
  layout?: "stack" | "grid"
}) {
  const { ticket, canAssign, assigneeSelection, handleAssign, actionPending, users, userLabel } = detail
  if (!ticket) return null
  const assigneeId = `${idPrefix}-assignee`
  return (
    <div className={layout === "grid" ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
      {crossTenant && ticket.tenantId && (
        <DetailField label="Tenant" wide={layout === "grid"}>
          <p className="flex min-w-0 items-center gap-1.5">
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate font-mono text-xs" title={ticket.tenantId}>
              {ticket.tenantId}
            </span>
          </p>
        </DetailField>
      )}
      <div className={cn("min-w-0 space-y-1.5", layout === "grid" && "sm:col-span-2")}>
        <Label htmlFor={assigneeId}>Assignee</Label>
        {canAssign ? (
          <Select value={assigneeSelection} onValueChange={(v) => void handleAssign(v)} disabled={actionPending === "assign"}>
            <SelectTrigger id={assigneeId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ASSIGNEE}>Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p id={assigneeId} className="text-sm text-foreground">
            {userLabel(ticket.assignedToUserId)}
          </p>
        )}
      </div>
      <DetailField label="Reporter">{userLabel(ticket.reporterUserId)}</DetailField>
      <DetailField label="Created">{formatDate(ticket.createdAtUtc, "long")}</DetailField>
      {ticket.updatedAtUtc && <DetailField label="Last updated">{formatDate(ticket.updatedAtUtc, "long")}</DetailField>}
      {ticket.resolvedAtUtc && <DetailField label="Resolved">{formatDate(ticket.resolvedAtUtc, "long")}</DetailField>}
      {ticket.closedAtUtc && <DetailField label="Closed">{formatDate(ticket.closedAtUtc, "long")}</DetailField>}
    </div>
  )
}

function ReadOnlyBadge() {
  return (
    <Badge variant="muted" title="Opened from the all-tenants desk — actions are disabled">
      <Eye aria-hidden />
      Read-only
    </Badge>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Page variant — the original full-page layout, unchanged in behaviour                       */
/* ------------------------------------------------------------------------------------------ */

function TicketDetailPage({ detail, crossTenant }: { detail: TicketDetailState; crossTenant: boolean }) {
  const backHref = crossTenant ? "/dashboard/tickets/all-tenants" : "/dashboard/tickets"
  const backLabel = crossTenant ? "Back to all tenants' tickets" : "Back to tickets"
  const { ticket, status, isLoading, loadError, permissionDenied, reload, comments } = detail

  if (isLoading) {
    return (
      <PageContainer maxWidth="lg">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-4 w-24" variant="text" />
          <Skeleton className="h-8 w-80 max-w-full" variant="text" />
        </div>
        <Card>
          <CardContent className="pt-6">
            <SkeletonText lines={4} />
          </CardContent>
        </Card>
      </PageContainer>
    )
  }

  if (permissionDenied) {
    return (
      <PageContainer maxWidth="lg">
        <PageHeader title="Ticket" backHref={backHref} backLabel={backLabel} icon={LifeBuoy} />
        <ErrorState
          title="You don't have access to this ticket"
          message="Your account doesn't hold the Tickets.View permission. Ask an administrator to grant it."
        />
      </PageContainer>
    )
  }

  if (loadError || !ticket || !status) {
    return (
      <PageContainer maxWidth="lg">
        <PageHeader title="Ticket" backHref={backHref} backLabel={backLabel} icon={LifeBuoy} />
        <ErrorState title="We couldn't load this ticket" message={loadError ?? "The ticket could not be found."} onRetry={() => void reload()} />
      </PageContainer>
    )
  }

  return (
    <PageContainer maxWidth="lg">
      <PageHeader
        title={ticket.title}
        backHref={backHref}
        backLabel={backLabel}
        icon={LifeBuoy}
        description={`#${ticket.number} · Reported ${formatDate(ticket.createdAtUtc, "relative")}`}
        badge={
          <>
            <TicketStatusBadge status={status} />
            <TicketPriorityBadge priority={ticket.priority} />
            {crossTenant && <ReadOnlyBadge />}
          </>
        }
        actions={<ActionButtons detail={detail} />}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Section spacing="sm">
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <DescriptionBody ticket={ticket} />
              </CardContent>
            </Card>
          </Section>

          <Section spacing="sm">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" aria-hidden />
                  Comments
                </CardTitle>
                <CardDescription>
                  {comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Discussion on this ticket"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CommentsBody detail={detail} crossTenant={crossTenant} idPrefix="ticket" />
              </CardContent>
            </Card>
          </Section>
        </div>

        <div className="min-w-0 space-y-6">
          <Section spacing="sm">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCog className="h-4 w-4" aria-hidden />
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DetailsBody detail={detail} crossTenant={crossTenant} idPrefix="ticket" />
              </CardContent>
            </Card>
          </Section>
        </div>
      </div>
    </PageContainer>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Panel variant — one pane: fixed header, internally scrolling body                          */
/* ------------------------------------------------------------------------------------------ */

function TicketDetailPane({
  detail,
  crossTenant,
  ticketId,
  onClose,
  headingId,
}: {
  detail: TicketDetailState
  crossTenant: boolean
  ticketId: string
  onClose?: () => void
  headingId: string
}) {
  const { ticket, status, isLoading, loadError, permissionDenied, reload, comments } = detail
  const headingRef = useRef<HTMLHeadingElement>(null)
  const idPrefix = `ticket-panel-${ticketId}`

  // Move focus into the pane when it opens (or switches ticket) so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [ticketId])

  const heading = ticket ? ticket.title : isLoading ? "Loading ticket…" : "Ticket"

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="shrink-0 space-y-3 border-b px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {ticket ? <span className="num font-mono">#{ticket.number}</span> : <Skeleton className="h-4 w-20" variant="text" />}
            {ticket && <span aria-hidden>·</span>}
            {ticket && <span className="truncate">Reported {formatDate(ticket.createdAtUtc, "relative")}</span>}
          </div>
          <div className="-mr-2 flex shrink-0 items-center">
            <Button asChild variant="ghost" size="icon">
              <Link href={ticketDetailHref(ticketId, crossTenant)} aria-label="Open full page" title="Open full page">
                <Maximize2 className="size-4" aria-hidden />
              </Link>
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close ticket details" title="Close (Esc)">
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="break-words text-lg font-semibold leading-snug tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
        >
          {heading}
        </h2>
        {ticket && status && (
          <div className="flex flex-wrap items-center gap-1.5">
            <TicketStatusBadge status={status} />
            <TicketPriorityBadge priority={ticket.priority} />
            {crossTenant && <ReadOnlyBadge />}
          </div>
        )}
        {ticket && <ActionButtons detail={detail} compact />}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" aria-busy={isLoading || undefined}>
        {isLoading ? (
          <div className="space-y-4">
            <SkeletonText lines={4} />
            <Skeleton className="h-24 w-full" />
            <SkeletonText lines={3} />
          </div>
        ) : permissionDenied ? (
          <ErrorState
            title="You don't have access to this ticket"
            message="Your account doesn't hold the Tickets.View permission. Ask an administrator to grant it."
            size="compact"
          />
        ) : loadError || !ticket ? (
          <ErrorState
            title="We couldn't load this ticket"
            message={loadError ?? "The ticket could not be found."}
            onRetry={() => void reload()}
            size="compact"
          />
        ) : (
          <div className="space-y-6 animate-fade-in">
            <section aria-labelledby={`${idPrefix}-desc`} className="space-y-2">
              <h3 id={`${idPrefix}-desc`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </h3>
              <DescriptionBody ticket={ticket} />
            </section>

            <section aria-labelledby={`${idPrefix}-details`} className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <h3 id={`${idPrefix}-details`} className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <UserCog className="size-3.5" aria-hidden />
                Details
              </h3>
              <DetailsBody
                detail={detail}
                crossTenant={crossTenant}
                idPrefix={idPrefix}
                layout="grid"
              />
            </section>

            <section aria-labelledby={`${idPrefix}-comments`} className="space-y-3">
              <h3 id={`${idPrefix}-comments`} className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <MessageSquare className="size-3.5" aria-hidden />
                Comments
                {comments.length > 0 && <span className="num normal-case">({comments.length})</span>}
              </h3>
              <CommentsBody detail={detail} crossTenant={crossTenant} idPrefix={idPrefix} />
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
