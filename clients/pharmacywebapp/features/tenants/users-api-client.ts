/**
 * Per-tenant user management for SuperAdmin, from the root/admin area (app/dashboard/tenants/[tenantId]).
 *
 * The Identity module's user endpoints (GET /api/v1/identity/users/search, POST .../register,
 * PUT .../users/{id}, DELETE .../users/{id}) are tenant-scoped by Finbuckle's ambient tenant context,
 * which the BFF normally sets from the request host — always "root" on the admin host. A SuperAdmin on
 * that host can therefore never reach another tenant's Identity database through the normal path.
 *
 * The .NET side already has an escape hatch for this: MultitenancyModule's root-operator header-override
 * middleware lets a caller whose JWT "tenant" claim is "root" scope one request to a different tenant by
 * sending that tenant's id in the `tenant` header — the middleware re-validates the claim server-side, so
 * it cannot be used by a non-root caller. Every call here rides that existing mechanism by sending the
 * X-Target-Tenant header to our own BFF (lib/api/dotnet-bff.ts turns it into the upstream `tenant`
 * header); no backend change was needed.
 *
 * The root Admin role's JWT already carries the full Identity permission set (Users.View/Create/Update
 * /Delete/ManageRoles — see PermissionConstants.Admin, granted to every tenant's Admin role including
 * root's), so these calls succeed without any new permission or endpoint.
 *
 * Admin password reset uses POST /identity/users/{id}/password (AdminSetPassword), which accepts the root
 * operator. Roles are read from GET /identity/users/{id}/roles and saved through the same PUT as the other
 * fields (AdminUpdateUser replaces the whole role set; Basic is always kept).
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import { jobRoleNames, jobRolesSet, type DotnetUserRole } from "@/lib/api/dashboard-dotnet"
import type { DotnetRoleDto } from "@/lib/api/roles-api"
import { roleAssignment } from "@/features/users/api-client"
import { TENANT_OVERRIDE_HEADER } from "@/lib/api/tenant-override-header"

export interface TenantUser {
  id: string
  userName: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  isActive: boolean
  emailConfirmed: boolean
  phoneNumber: string | null
  createdAtUtc: string
}

interface DotnetPagedUsers {
  items: TenantUser[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface CreateTenantUserInput {
  firstName: string
  lastName: string
  email: string
  userName: string
  password: string
  phoneNumber?: string | null
  /** Job roles to give the user (Basic is always added). */
  roles: string[]
}

export interface UpdateTenantUserInput {
  firstName: string
  lastName?: string | null
  phoneNumber?: string | null
  isActive?: boolean
  /** Replaces the user's job roles; omit to leave them unchanged. */
  roles?: string[]
}

function overrideHeader(tenantId: string): Record<string, string> {
  return { [TENANT_OVERRIDE_HEADER]: tenantId }
}

export const tenantUsersApi = {
  list: async (tenantId: string, search = "", pageNumber = 1, pageSize = 50): Promise<DotnetPagedUsers> => {
    const params = new URLSearchParams()
    params.set("pageNumber", String(pageNumber))
    params.set("pageSize", String(pageSize))
    if (search.trim()) params.set("search", search.trim())
    return dotnetClient.get<DotnetPagedUsers>(`/api/v1/identity/users/search?${params}`, overrideHeader(tenantId))
  },

  /** The tenant's own roles (not root's). */
  listRoles: async (tenantId: string): Promise<DotnetRoleDto[]> => {
    const page = await dotnetClient.get<{ items?: DotnetRoleDto[] }>(
      "/api/v1/identity/roles?pageNumber=1&pageSize=200",
      overrideHeader(tenantId),
    )
    return (page.items ?? []).sort((a, b) => a.name.localeCompare(b.name))
  },

  /** A user's job roles (Basic left out). */
  userRoles: async (tenantId: string, userId: string): Promise<string[]> =>
    jobRoleNames(
      await dotnetClient.get<DotnetUserRole[]>(`/api/v1/identity/users/${encodeURIComponent(userId)}/roles`, overrideHeader(tenantId)),
    ),

  create: async (tenantId: string, input: CreateTenantUserInput): Promise<void> => {
    const created = await dotnetClient.post<{ userId: string }>(
      "/api/v1/identity/register",
      {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        userName: input.userName,
        password: input.password,
        confirmPassword: input.password,
        phoneNumber: input.phoneNumber ?? null,
      },
      undefined,
      overrideHeader(tenantId),
    )
    if (input.roles.length > 0) {
      const path = `/api/v1/identity/users/${encodeURIComponent(created.userId)}/roles`
      const rows = await dotnetClient.get<DotnetUserRole[]>(path, overrideHeader(tenantId))
      await dotnetClient.post(path, { userId: created.userId, userRoles: roleAssignment(rows, input.roles) }, undefined, overrideHeader(tenantId))
    }
  },

  update: async (tenantId: string, userId: string, input: UpdateTenantUserInput): Promise<void> => {
    await dotnetClient.put(
      `/api/v1/identity/users/${encodeURIComponent(userId)}`,
      {
        id: userId,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        phoneNumber: input.phoneNumber ?? null,
        isActive: input.isActive ?? null,
        roles: input.roles ? jobRolesSet(input.roles) : null,
      },
      overrideHeader(tenantId),
    )
  },

  /** Admin sets a new password; the user is signed out everywhere. */
  setPassword: async (tenantId: string, userId: string, newPassword: string): Promise<void> => {
    await dotnetClient.post(
      `/api/v1/identity/users/${encodeURIComponent(userId)}/password`,
      { userId, newPassword, confirmNewPassword: newPassword },
      undefined,
      overrideHeader(tenantId),
    )
  },

  /** Deletes the account: it can't sign in and leaves the list; history keeps the name. */
  remove: async (tenantId: string, userId: string): Promise<void> => {
    await dotnetClient.delete(`/api/v1/identity/users/${encodeURIComponent(userId)}`, overrideHeader(tenantId))
  },
}
