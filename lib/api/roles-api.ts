/**
 * Role + permission-catalog management over the .NET Identity API, through the /api/dotnet BFF.
 * Browser-side only: fetch via dotnetClient, no Supabase.
 *
 * Confirmed against backend source (backend/dotnet-starter-kit/src/Modules/Identity), not the React
 * admin/dashboard apps' TypeScript types — those are a different app on the same backend:
 *
 *   GET    /api/v1/identity/roles                -> PagedResponse<RoleDto>   (Permissions.Roles.View)
 *   GET    /api/v1/identity/roles/{id}            -> RoleDto                 (Permissions.Roles.View)
 *   GET    /api/v1/identity/{id}/permissions      -> RoleDto (w/ permissions)(Permissions.Roles.View)
 *   POST   /api/v1/identity/roles                 -> RoleDto                 (Permissions.Roles.Create)
 *   PUT    /api/v1/identity/{id}/permissions      -> string                  (Permissions.Roles.Update)
 *   DELETE /api/v1/identity/roles/{id}            -> 204                     (Permissions.Roles.Delete)
 *   GET    /api/v1/identity/permissions/catalog   -> PermissionCatalogEntryDto[] (host-wide; see below)
 *
 * Note the asymmetry: the GetRolePermissions/UpdateRolePermissions endpoints are mapped directly on
 * the "api/v{version}/identity" group, NOT under "/roles/{id}/permissions" as the two React apps'
 * route might suggest — the path is "/identity/{id}/permissions", confirmed from
 * Modules.Identity/IdentityModule.cs + GetRolePermissionsEndpoint.cs / UpdateRolePermissionsEndpoint.cs.
 *
 * System roles (RoleConstants.DefaultRoles = ["Admin", "Basic"]) are rejected server-side for
 * rename/describe, permission updates and delete, each with a 400 CustomException whose message
 * (surfaced verbatim as ProblemDetails.detail, see dotnet-problem.ts) says why:
 *   - "System roles cannot be modified."                                          (rename/describe)
 *   - "System role permissions are managed by the framework and cannot be modified." (permissions)
 *   - "System roles cannot be deleted."                                           (delete)
 *   - "Cannot rename a role to a system role's name." / "...create a role using..." (name collision)
 */

import { DotnetApiError, dotnetClient, type createDotnetClient } from "@/lib/api/dotnet-client"
import { BRANCHES_VIEW_ALL_PERMISSION, isDotnetRootUser } from "@/lib/api/dotnet-permissions"

export { BRANCHES_VIEW_ALL_PERMISSION }

type DotnetClient = Pick<ReturnType<typeof createDotnetClient>, "get" | "post" | "put" | "delete">

/** Permission names from IdentityPermissions.Roles (backend Identity Contracts/Authorization). */
export const ROLES_VIEW_PERMISSION = "Permissions.Roles.View"
export const ROLES_CREATE_PERMISSION = "Permissions.Roles.Create"
export const ROLES_UPDATE_PERMISSION = "Permissions.Roles.Update"
export const ROLES_DELETE_PERMISSION = "Permissions.Roles.Delete"

export type BranchAccess = "all" | "assigned"

export function branchAccessOf(permissions: Iterable<string> | null | undefined): BranchAccess {
  for (const permission of permissions ?? []) if (permission === BRANCHES_VIEW_ALL_PERMISSION) return "all"
  return "assigned"
}

/** Framework-seeded roles every tenant gets; the server rejects edits/permission changes/deletes on these. */
export const SYSTEM_ROLE_NAMES: readonly string[] = ["Admin", "Basic"]

export function isSystemRole(name: string): boolean {
  return SYSTEM_ROLE_NAMES.includes(name)
}

/** Identity RoleDto (camelCase JSON). `permissions` is only populated by the GetRoleWithPermissions call. */
export interface DotnetRoleDto {
  id: string
  name: string
  description?: string | null
  permissions?: readonly string[] | null
}

interface DotnetPagedRoles {
  items: DotnetRoleDto[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** Identity PermissionCatalogEntryDto (camelCase JSON). */
export interface PermissionCatalogEntry {
  name: string
  description: string
  resource: string
  action: string
  isBasic: boolean
  isRoot: boolean
}

export interface PermissionGroup {
  resource: string
  permissions: PermissionCatalogEntry[]
}

/** Lists all roles for the current tenant (first 200 — tenants have a small, human-sized role count). */
export async function listRoles(client: DotnetClient = dotnetClient): Promise<DotnetRoleDto[]> {
  const page = await client.get<DotnetPagedRoles>("/identity/roles?pageNumber=1&pageSize=200")
  return page.items ?? []
}

/** Fetches one role together with its assigned permissions. */
export async function getRoleWithPermissions(id: string, client: DotnetClient = dotnetClient): Promise<DotnetRoleDto> {
  return client.get<DotnetRoleDto>(`/identity/${encodeURIComponent(id)}/permissions`)
}

/** Creates (empty id) or updates (existing id) a role's name/description. */
export async function upsertRole(
  input: { id?: string; name: string; description?: string },
  client: DotnetClient = dotnetClient,
): Promise<DotnetRoleDto> {
  return client.post<DotnetRoleDto>("/identity/roles", {
    id: input.id ?? "",
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
  })
}

/** Replaces the full permission set on a role. The route id and body.roleId must match (server 400s otherwise). */
export async function updateRolePermissions(
  roleId: string,
  permissions: readonly string[],
  client: DotnetClient = dotnetClient,
): Promise<string> {
  return client.put<string>(`/identity/${encodeURIComponent(roleId)}/permissions`, {
    roleId,
    permissions: [...permissions],
  })
}

/** Deletes a role by id. The server rejects system roles with a 400. */
export async function deleteRole(id: string, client: DotnetClient = dotnetClient): Promise<void> {
  await client.delete<void>(`/identity/roles/${encodeURIComponent(id)}`)
}

/** Fetches the host-wide permission catalog used to render the permission checklist. */
export async function getPermissionCatalog(client: DotnetClient = dotnetClient): Promise<PermissionCatalogEntry[]> {
  return client.get<PermissionCatalogEntry[]>("/identity/permissions/catalog")
}

/** Groups catalog entries by their Resource segment, sorted by resource then permission name. */
export function groupPermissionsByResource(entries: readonly PermissionCatalogEntry[]): PermissionGroup[] {
  const byResource = new Map<string, PermissionCatalogEntry[]>()
  for (const entry of entries) {
    const list = byResource.get(entry.resource)
    if (list) list.push(entry)
    else byResource.set(entry.resource, [entry])
  }
  return [...byResource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, permissions]) => ({
      resource,
      permissions: [...permissions].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

/** Message to show the user. DotnetApiError carries the server detail verbatim (for example a system-role rejection). */
export function roleErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (error instanceof DotnetApiError) return error.normalized.message || fallback
  return error instanceof Error && error.message ? error.message : fallback
}

/** Roles.View (or root) gate for rendering the role management surface. */
export function canViewRoles(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(ROLES_VIEW_PERMISSION)
}

/** Roles.Create permission check. */
export function canCreateRoles(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(ROLES_CREATE_PERMISSION)
}

/** Roles.Update permission check (covers both profile and permission-set edits). */
export function canUpdateRoles(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(ROLES_UPDATE_PERMISSION)
}

/** Roles.Delete permission check. */
export function canDeleteRoles(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(ROLES_DELETE_PERMISSION)
}
