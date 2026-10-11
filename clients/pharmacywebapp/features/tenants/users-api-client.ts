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
 * Admin-initiated password reset: there is no such endpoint. ForgotPassword/ResetPassword
 * (Identity/Features/v1/Users/{ForgotPassword,ResetPassword}) are both token-based self-service flows
 * (AllowAnonymous, driven by an emailed link) — there is no "admin triggers a reset for someone else"
 * command/handler anywhere in the Identity module or UserRegistrationService. Rather than invent one,
 * this client intentionally has no reset action; the UI says so explicitly.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
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
}

export interface UpdateTenantUserInput {
  firstName: string
  lastName?: string | null
  phoneNumber?: string | null
  isActive?: boolean
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

  create: async (tenantId: string, input: CreateTenantUserInput): Promise<void> => {
    await dotnetClient.post(
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
      },
      overrideHeader(tenantId),
    )
  },

  remove: async (tenantId: string, userId: string): Promise<void> => {
    await dotnetClient.delete(`/api/v1/identity/users/${encodeURIComponent(userId)}`, overrideHeader(tenantId))
  },
}
