/**
 * Internal controls as tenant settings (category "controls"), mirroring the .NET InternalControlSettings
 * (Modules.Reference.Contracts/Controls): per-role discount caps, the refund approval threshold, and segregation of
 * duties on manual vouchers. Missing or unreadable values fall back to the same defaults the server uses.
 */

export const CONTROLS_KEYS = {
  discountCaps: "controls.discount_caps",
  refundApprovalThreshold: "controls.refund_approval_threshold",
  voucherCreatorCannotPost: "controls.voucher_creator_cannot_post",
  requireOpenShift: "controls.require_open_shift",
} as const

/** The discount-caps entry for users none of whose roles has its own entry. */
export const OTHER_ROLES = "*"

/** A ceiling in percent of the gross; null = unlimited. */
export interface DiscountCap {
  line: number | null
  bill: number | null
}

export interface InternalControls {
  discountCaps: Record<string, DiscountCap>
  refundApprovalThreshold: number
  voucherCreatorCannotPost: boolean
  /** A cash sale needs an open cash shift at the branch. On unless stored as "false". */
  requireOpenShift: boolean
}

export const DEFAULT_DISCOUNT_CAPS: Readonly<Record<string, DiscountCap>> = {
  Cashier: { line: 5, bill: 5 },
  Pharmacist: { line: 10, bill: 10 },
  Manager: { line: null, bill: null },
  [OTHER_ROLES]: { line: 5, bill: 5 },
}

export const DEFAULT_INTERNAL_CONTROLS: InternalControls = {
  discountCaps: { ...DEFAULT_DISCOUNT_CAPS },
  refundApprovalThreshold: 1000,
  voucherCreatorCannotPost: false,
  requireOpenShift: true,
}

function clampPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, value))
}

/** Defaults overlaid with the stored JSON; a malformed document is ignored as a whole. Role names keep their case. */
export function parseDiscountCaps(json: string | null | undefined): Record<string, DiscountCap> {
  const caps: Record<string, DiscountCap> = { ...DEFAULT_DISCOUNT_CAPS }
  if (!json || !json.trim()) return caps
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ...DEFAULT_DISCOUNT_CAPS }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return caps
  for (const [role, entry] of Object.entries(parsed as Record<string, unknown>)) {
    const name = role.trim()
    if (!name || !entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const value = entry as Record<string, unknown>
    // Same role in another case replaces the default entry (the server matches role names case-insensitively).
    const existing = Object.keys(caps).find((k) => k.toLowerCase() === name.toLowerCase())
    if (existing && existing !== name) delete caps[existing]
    caps[name] = { line: clampPercent(value.line), bill: clampPercent(value.bill) }
  }
  return caps
}

export function serializeDiscountCaps(caps: Record<string, DiscountCap>): string {
  const document: Record<string, { line: number | null; bill: number | null }> = {}
  for (const [role, cap] of Object.entries(caps)) {
    document[role] = { line: cap.line, bill: cap.bill }
  }
  return JSON.stringify(document)
}

/** Reads the controls from the tenant settings rows (any category). */
export function parseInternalControls(rows: ReadonlyArray<{ key: string; value: string }> | null | undefined): InternalControls {
  const get = (key: string) => rows?.find((r) => r.key.toLowerCase() === key)?.value
  const threshold = Number(get(CONTROLS_KEYS.refundApprovalThreshold))
  return {
    discountCaps: parseDiscountCaps(get(CONTROLS_KEYS.discountCaps)),
    refundApprovalThreshold:
      get(CONTROLS_KEYS.refundApprovalThreshold) !== undefined && Number.isFinite(threshold) && threshold >= 0
        ? threshold
        : DEFAULT_INTERNAL_CONTROLS.refundApprovalThreshold,
    voucherCreatorCannotPost: get(CONTROLS_KEYS.voucherCreatorCannotPost)?.trim().toLowerCase() === "true",
    requireOpenShift: get(CONTROLS_KEYS.requireOpenShift)?.trim().toLowerCase() !== "false",
  }
}

/**
 * A cap field as typed in the settings form: blank = unlimited, otherwise 0-100. Returns undefined for invalid input.
 */
export function parseCapInput(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0 || value > 100) return undefined
  return value
}

/** Roles shown in the caps table: the tenant's roles (Admin is always unlimited, Basic is not a job role), then "*". */
export function capRoleNames(tenantRoles: readonly string[], caps: Record<string, DiscountCap>): string[] {
  const names = new Map<string, string>()
  for (const name of [...tenantRoles, ...Object.keys(caps)]) {
    const lower = name.toLowerCase()
    if (name === OTHER_ROLES || lower === "admin" || lower === "basic") continue
    if (!names.has(lower)) names.set(lower, name)
  }
  return [...[...names.values()].sort((a, b) => a.localeCompare(b)), OTHER_ROLES]
}
