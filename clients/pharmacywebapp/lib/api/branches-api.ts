/**
 * Branch management over the .NET Multitenancy API (api/v1/branches) through the /api/dotnet BFF.
 * Browser-side only: fetch via dotnetClient, no Supabase.
 */

import { DotnetApiError, dotnetClient, type createDotnetClient } from "@/lib/api/dotnet-client"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

type DotnetClient = Pick<ReturnType<typeof createDotnetClient>, "get" | "post" | "put" | "delete">

/** Permission name from MultitenancyPermissions.Branches.Manage (backend Multitenancy Contracts/Authorization). */
export const BRANCHES_MANAGE_PERMISSION = "Permissions.Branches.Manage"

/** Shape of BranchDto as returned by the .NET API (camelCase JSON). */
export interface DotnetBranchDto {
  id: string
  tenantId?: string
  name: string
  code: string
  isActive: boolean
  /** Server-flagged tenant default (added alongside the IsDefault migration). Optional for backward compatibility. */
  isDefault?: boolean
  createdOnUtc: string
  lastModifiedOnUtc?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
}

interface DotnetPagedBranches {
  items: DotnetBranchDto[]
}

export interface Branch {
  id: string
  name: string
  code: string
  isActive: boolean
  address: string | null
  phone: string | null
  email: string | null
  createdOnUtc: string
  /**
   * The tenant default branch. Reads the server's IsDefault flag when present; for a tenant with no
   * flagged row yet (pre-migration data), falls back to the oldest-by-createdOnUtc branch — the same
   * fallback GetDefaultBranchIdAsync uses server-side, so the two stay consistent.
   */
  isDefault: boolean
}

/** Form values as typed in the UI. Empty optional fields are sent as null so the server clears them. */
export interface BranchInput {
  name: string
  code: string
  address: string
  phone: string
  email: string
}

export interface UpdateBranchInput extends BranchInput {
  isActive: boolean
}

export interface CreateBranchBody {
  name: string
  code: string
  address: string | null
  phone: string | null
  email: string | null
}

export interface UpdateBranchBody extends CreateBranchBody {
  id: string
  isActive: boolean
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

/** Request body for POST /branches (CreateBranchCommand). */
export function buildCreateBranchBody(input: BranchInput): CreateBranchBody {
  return {
    name: input.name.trim(),
    code: input.code.trim(),
    address: orNull(input.address),
    phone: orNull(input.phone),
    email: orNull(input.email),
  }
}

/** Request body for PUT /branches/{id} (UpdateBranchCommand). The id must match the route id. */
export function buildUpdateBranchBody(id: string, input: UpdateBranchInput): UpdateBranchBody {
  return {
    id,
    ...buildCreateBranchBody(input),
    isActive: input.isActive,
  }
}

/**
 * Maps DTOs to UI rows and marks the default branch. Prefers the server's IsDefault flag; if no item
 * carries it (older API build, or a tenant with no flagged row), falls back to the oldest-by-createdOnUtc
 * branch — matching BranchService.GetDefaultBranchIdAsync's own fallback for that same case.
 */
export function toBranches(items: readonly DotnetBranchDto[]): Branch[] {
  const flaggedId = items.find((item) => item.isDefault === true)?.id ?? null

  let fallbackId: string | null = null
  let fallbackTime = Number.POSITIVE_INFINITY
  if (!flaggedId) {
    for (const item of items) {
      const time = Date.parse(item.createdOnUtc)
      if (time < fallbackTime) {
        fallbackTime = time
        fallbackId = item.id
      }
    }
  }
  const defaultId = flaggedId ?? fallbackId

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    isActive: item.isActive,
    address: item.address ?? null,
    phone: item.phone ?? null,
    email: item.email ?? null,
    createdOnUtc: item.createdOnUtc,
    isDefault: item.id === defaultId,
  }))
}

interface DotnetBranchContextDto {
  branches: DotnetBranchDto[]
  currentBranchId: string | null
}

export interface BranchContext {
  branches: Branch[]
  /** The caller's saved branch selection; null means the API falls back to the tenant default. */
  currentBranchId: string | null
}

/** GET /branches/context: the tenant's branches plus the caller's current branch. */
export async function getBranchContext(client: DotnetClient = dotnetClient): Promise<BranchContext> {
  const ctx = await client.get<DotnetBranchContextDto>("/branches/context")
  return { branches: toBranches(ctx.branches ?? []), currentBranchId: ctx.currentBranchId ?? null }
}

/**
 * POST /branches/switch: saves the caller's current branch (FshUser.CurrentBranchId). Every later write
 * (sales, receipts, shifts, deposits) lands on it, and branch-scoped reads default to it. ViewAll holders
 * may pick any active branch; others only their own. Returns the refreshed context.
 */
export async function switchBranch(branchId: string, client: DotnetClient = dotnetClient): Promise<BranchContext> {
  const ctx = await client.post<DotnetBranchContextDto>("/branches/switch", { branchId })
  return { branches: toBranches(ctx.branches ?? []), currentBranchId: ctx.currentBranchId ?? null }
}

/** Lists the tenant's branches (first 100). The single list call for branch views. */
export async function listBranches(client: DotnetClient = dotnetClient): Promise<Branch[]> {
  const page = await client.get<DotnetPagedBranches>("/branches?pageNumber=1&pageSize=100")
  return toBranches(page.items ?? [])
}

export async function createBranch(input: BranchInput, client: DotnetClient = dotnetClient): Promise<DotnetBranchDto> {
  return client.post<DotnetBranchDto>("/branches", buildCreateBranchBody(input))
}

export async function updateBranch(
  id: string,
  input: UpdateBranchInput,
  client: DotnetClient = dotnetClient,
): Promise<DotnetBranchDto> {
  return client.put<DotnetBranchDto>(`/branches/${encodeURIComponent(id)}`, buildUpdateBranchBody(id, input))
}

/** Soft deactivate. The server answers 409 for the default branch and for the last active branch. */
export async function deactivateBranch(id: string, client: DotnetClient = dotnetClient): Promise<DotnetBranchDto> {
  return client.delete<DotnetBranchDto>(`/branches/${encodeURIComponent(id)}`)
}

/** Message to show the user. DotnetApiError carries the server detail verbatim (for example the 409 text). */
export function branchErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (error instanceof DotnetApiError) return error.normalized.message || fallback
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Branches.Manage check on the signed-in user's permission claims. Root users hold every root
 * permission and are allowed, mirroring dotnetPermissionAllowed.
 */
export function canManageBranches(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(BRANCHES_MANAGE_PERMISSION)
}
