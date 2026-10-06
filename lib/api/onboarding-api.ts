/**
 * Migration wizard calls, switchable per backend target (ONBOARDING). The legacy path keeps the
 * /api/migration routes, which post each opening balance as soon as it is entered. The .NET
 * Onboarding module instead saves a draft per category and posts every category in one commit, so on
 * this path the opening-* saves only store drafts and "complete" is what posts the vouchers.
 *
 * Behaviour differences the wizard inherits on this path:
 *  - A category can be saved once per session. A second save would replace the drafts rather than add
 *    to them (the legacy routes add), so it is refused instead of silently dropping earlier lines.
 *  - Opening stock needs an expiry date on every line (the legacy form made it optional).
 *  - The branch id is not sent; the .NET side uses the current branch.
 *  - Per-line failures and "already has stock" warnings do not exist on .NET; the result reports none.
 *  - The .NET session has no tenant id; the mapped session shows an empty tenant_id.
 */

import type { MigrationSession, OpeningStockItem } from "@/features/migration/api-client"
import { dotnetClient } from "@/lib/api/dotnet-client"

const SESSIONS = "/api/v1/onboarding/migration/sessions"
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** MigrationSessionStatusDto (camelCase). Status is the enum name; categories list only categories with lines. */
export interface DotnetMigrationCategorySummaryDto {
  category: string
  lineCount: number
  totalAmount: number
}

export interface DotnetMigrationSessionStatusDto {
  id: string
  cutoverDate: string
  notes: string | null
  status: string
  createdAtUtc: string
  committedAtUtc: string | null
  committedBy: string | null
  categories: DotnetMigrationCategorySummaryDto[]
  bankVoucherId: string | null
  cashVoucherId: string | null
  customerVoucherId: string | null
  supplierVoucherId: string | null
  stockVoucherId: string | null
}

/** MigrationCommitResultDto (camelCase). */
export interface DotnetMigrationCommitResultDto {
  sessionId: string
  bankVoucherId: string | null
  cashVoucherId: string | null
  customerVoucherId: string | null
  supplierVoucherId: string | null
  stockVoucherId: string | null
  totalOpeningValuePosted: number
}

/** Category names as the .NET MigrationCategory enum spells them. */
export type OpeningCategory = "Cash" | "Bank" | "Customer" | "Supplier" | "Stock"

/** One draft line, as DraftLineInput (camelCase). Only the fields a category uses are set. */
export interface DraftLinePayload {
  partyId?: string
  medicineId?: string
  amount?: number
  quantity?: number
  unitCost?: number
  sellingPrice?: number | null
  batchNo?: string | null
  expiryDate?: string
  description?: string | null
}

const STATUS: Record<string, MigrationSession["status"]> = {
  draft: "draft",
  committed: "completed",
}

export function toMigrationSession(dto: DotnetMigrationSessionStatusDto): MigrationSession {
  const status = STATUS[dto.status.toLowerCase()]
  if (!status) throw new Error(`Unknown migration session status from .NET API: ${dto.status}`)
  return {
    id: dto.id,
    tenant_id: "",
    status,
    cutover_date: dto.cutoverDate,
    notes: dto.notes,
    created_at: dto.createdAtUtc,
    completed_at: dto.committedAtUtc,
  }
}

function nullIfEmpty(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function round2(value: number): number {
  return Number(value.toFixed(2))
}

export function startSessionBody(input: { cutover_date: string; notes?: string | null }) {
  if (!DATE_ONLY.test(input.cutover_date)) throw new Error("Cutover date must be YYYY-MM-DD.")
  return { cutoverDate: input.cutover_date, notes: nullIfEmpty(input.notes) }
}

/** Opening stock lines. The .NET validator requires an expiry date, so a line without one is refused here. */
export function openingStockLines(items: OpeningStockItem[]): DraftLinePayload[] {
  return items.map((item) => {
    if (!item.expiry_date) {
      throw new Error("Every opening stock line needs an expiry date on the .NET backend.")
    }
    return {
      medicineId: item.medicine_id,
      quantity: item.quantity,
      unitCost: item.unit_cost,
      sellingPrice: null,
      batchNo: nullIfEmpty(item.batch_number),
      expiryDate: item.expiry_date,
      description: null,
    }
  })
}

/** Total of the stock lines (quantity times unit cost), as the legacy result reports it. */
export function openingStockTotal(items: OpeningStockItem[]): number {
  return round2(items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0))
}

/** Cash and bank take one amount, which must be positive (the legacy service enforces the same). */
export function balanceLines(amount: number): DraftLinePayload[] {
  if (!(amount > 0)) throw new Error("Amount must be positive")
  return [{ amount, description: null }]
}

/** Customer and supplier balances, one line per party. */
export function partyLines(entries: { id: string; amount: number }[]): DraftLinePayload[] {
  return entries.map((entry) => ({ partyId: entry.id, amount: entry.amount, description: null }))
}

export function saveDraftBody(category: OpeningCategory, lines: DraftLinePayload[]) {
  return { category, lines }
}

/** Refuses a second save for a category that already has draft lines (see the header note). */
export function assertCategoryEmpty(
  categories: DotnetMigrationCategorySummaryDto[],
  category: OpeningCategory,
  label: string,
): void {
  const existing = categories.find((c) => c.category.toLowerCase() === category.toLowerCase())
  if (existing && existing.lineCount > 0) {
    throw new Error(
      `${label} is already saved for this session. On the .NET backend a second save would replace the first, so it is refused.`,
    )
  }
}

async function fetchCurrentSession(): Promise<DotnetMigrationSessionStatusDto | null> {
  const dto = await dotnetClient.get<DotnetMigrationSessionStatusDto | null | undefined>(`${SESSIONS}/current`)
  return dto ?? null
}

async function requireDraftSession(): Promise<DotnetMigrationSessionStatusDto> {
  const session = await fetchCurrentSession()
  if (!session) throw new Error("Start a migration session first (set the cutover date).")
  if (STATUS[session.status.toLowerCase()] !== "draft") throw new Error("This migration session is already committed.")
  return session
}

export const onboardingDotnetApi = {
  getSession: async (): Promise<MigrationSession | null> => {
    const dto = await fetchCurrentSession()
    return dto ? toMigrationSession(dto) : null
  },

  startSession: async (input: { cutover_date: string; notes?: string | null }): Promise<MigrationSession> => {
    await dotnetClient.post<string>(SESSIONS, startSessionBody(input))
    const dto = await fetchCurrentSession()
    if (!dto) throw new Error("The migration session could not be read back after it was started.")
    return toMigrationSession(dto)
  },

  /** Saves the drafts for one category. Returns the number of lines saved. */
  saveCategory: async (category: OpeningCategory, lines: DraftLinePayload[], label: string): Promise<number> => {
    const session = await requireDraftSession()
    assertCategoryEmpty(session.categories, category, label)
    return dotnetClient.post<number>(`${SESSIONS}/${encodeURIComponent(session.id)}/draft-lines`, saveDraftBody(category, lines))
  },

  /** Posts every saved category. This is the step that writes the vouchers on the .NET side. */
  commit: async (): Promise<DotnetMigrationCommitResultDto> => {
    const session = await requireDraftSession()
    return dotnetClient.post<DotnetMigrationCommitResultDto>(`${SESSIONS}/${encodeURIComponent(session.id)}/commit`, {})
  },
}
