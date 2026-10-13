/**
 * Manager approvals (internal controls). A guarded .NET action — a discount over the cashier's cap, cancelling a
 * sale, a refund above the approval threshold, going past a customer's credit limit, a price below cost — answers
 * 403 with title "ApprovalRequiredException" and `errors: ["approval_required", action, amount, targetRef]`. The UI
 * then shows the approval dialog: an approver re-enters their password (POST /identity/approvals), which returns a
 * short-lived single-use token bound to that action, amount and target, and the action is resubmitted with it.
 */

import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

/** Identity's Approvals.View: reading the approvals log (the only approvals permission carried in the token). */
export const APPROVALS_VIEW_PERMISSION = "Permissions.Approvals.View"

/** Whether the signed-in user may open Reports → Approvals log. */
export function canViewApprovalsLog(permissions: readonly string[]): boolean {
  return isDotnetRootUser(permissions) || permissions.includes(APPROVALS_VIEW_PERMISSION)
}

export const APPROVAL_ACTIONS = [
  "sale.discount",
  "sale.void",
  "sale.refund",
  "sale.credit_override",
  "sale.price_level",
  "inventory.price_below_cost",
] as const

export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number]

/** What the server asked to be approved. */
export interface ApprovalRequest {
  action: ApprovalAction
  /** Percent for a discount, otherwise money (sale total, refund, on-account balance, per-unit shortfall). */
  amount: number
  /** Sale / batch / medicine id, or the checkout's idempotency key; null when unbound. */
  targetRef: string | null
  /** The server's explanation, e.g. "Manager approval is required: a 12% discount is above your 5% per line limit." */
  message: string
}

const APPROVAL_TITLE = "ApprovalRequiredException"
const APPROVAL_MARKER = "approval_required"

interface NormalizedLike {
  status?: unknown
  title?: unknown
  message?: unknown
  details?: unknown
}

export function isApprovalAction(value: unknown): value is ApprovalAction {
  return typeof value === "string" && (APPROVAL_ACTIONS as readonly string[]).includes(value)
}

/** The approval the server asked for when `error` is its 403 approval_required, otherwise null. */
export function parseApprovalRequired(error: unknown): ApprovalRequest | null {
  if (!error || typeof error !== "object") return null
  const normalized = ((error as { normalized?: NormalizedLike }).normalized ?? error) as NormalizedLike
  if (normalized.status !== 403) return null
  if (!Array.isArray(normalized.details)) return null
  const [marker, action, amount, targetRef] = normalized.details as unknown[]
  if (marker !== APPROVAL_MARKER) return null
  if (normalized.title !== undefined && normalized.title !== APPROVAL_TITLE) return null
  if (!isApprovalAction(action)) return null
  const parsedAmount = typeof amount === "string" ? Number(amount) : NaN
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return null
  return {
    action,
    amount: parsedAmount,
    targetRef: typeof targetRef === "string" && targetRef.trim() ? targetRef.trim() : null,
    message: typeof normalized.message === "string" ? normalized.message : "Manager approval is required.",
  }
}

const ACTION_LABELS: Record<ApprovalAction, string> = {
  "sale.discount": "Discount above limit",
  "sale.void": "Cancel sale",
  "sale.refund": "Refund above limit",
  "sale.credit_override": "Credit limit override",
  "sale.price_level": "Cheaper price level",
  "inventory.price_below_cost": "Price below cost",
}

/** Short label for an action (approvals log, dialog title). Unknown actions are shown as-is. */
export function approvalActionLabel(action: string): string {
  return isApprovalAction(action) ? ACTION_LABELS[action] : action
}

/** Whether the action's amount is a percent (discount) rather than money. */
export function isPercentAction(action: string): boolean {
  return action === "sale.discount"
}

/** The amount as shown to the approver: "12.5%" for a discount, otherwise the given money formatter. */
export function formatApprovalAmount(action: string, amount: number, formatMoney: (n: number) => string): string {
  if (isPercentAction(action)) {
    return `${Number(amount.toFixed(2))}%`
  }
  return formatMoney(amount)
}

/**
 * Adds a freshly issued token to the ones a resubmission carries (an action may need several approvals — e.g. a
 * discount and a credit override on the same checkout). Keeps at most `max` (the server accepts 5), newest last.
 */
export function withApprovalToken(tokens: readonly string[] | undefined, token: string, max = 5): string[] {
  const next = [...(tokens ?? []).filter((t) => t && t !== token), token]
  return next.slice(Math.max(0, next.length - max))
}

/** Body for POST /api/v1/identity/approvals. */
export interface IssueApprovalBody {
  approverLogin: string
  password: string
  action: ApprovalAction
  amount: number
  targetRef: string | null
  reason: string | null
}

export function buildIssueApprovalBody(
  request: Pick<ApprovalRequest, "action" | "amount" | "targetRef">,
  approverLogin: string,
  password: string,
  reason?: string,
): IssueApprovalBody {
  return {
    approverLogin: approverLogin.trim(),
    password,
    action: request.action,
    amount: request.amount,
    targetRef: request.targetRef,
    reason: reason?.trim() ? reason.trim() : null,
  }
}

/** Status of an approvals-log row as the API reports it. */
export type ApprovalStatus = "used" | "expired" | "open"

export function approvalStatusLabel(status: string): string {
  switch (status) {
    case "used":
      return "Used"
    case "expired":
      return "Not used (expired)"
    case "open":
      return "Waiting to be used"
    default:
      return status
  }
}
