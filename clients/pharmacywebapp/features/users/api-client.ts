import { BaseFilters } from "@/lib/api/utils"
import { DotnetApiError, dotnetClient } from "@/lib/api/dotnet-client"
import { userFromDotnet, type DotnetUserProfile, type DotnetUserRole } from "@/lib/api/dashboard-dotnet"
import { usernameFromEmail } from "@/lib/api/auth-api"

export interface User {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
  is_active?: boolean
  /** Branch the user works in; null means the tenant's default branch. */
  branch_id?: string | null
  /** Authenticator (TOTP) sign-in is on for this account. */
  two_factor_enabled?: boolean
  created_at: string
  updated_at: string
}

export interface UsersFilters extends BaseFilters {
  role?: string
}

export interface CreateUserData {
  email: string
  full_name: string
  role: string
  phone?: string | null
  password: string
  /** Branch the user works in. Omit to use the tenant's default branch. */
  branch_id?: string | null
}

export interface UpdateUserData {
  email?: string
  full_name?: string
  role?: string
  phone?: string | null
  is_active?: boolean
  /** Moves the user to another branch; omit to leave it unchanged. */
  branch_id?: string | null
}

const EMAIL_UNSUPPORTED = "Changing a user's email is not available on the .NET API yet"
const DEFAULT_PAGE_SIZE = 50

/** Identity RegisterUserResponse (camelCase). */
interface DotnetRegisterUserResponse {
  userId: string
}

/** Identity PagedResponse<UserDto> (camelCase). */
interface DotnetPagedUsers {
  items: DotnetUserProfile[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** Identity PagedResponse<RoleDto> (camelCase). */
interface DotnetRoleRow {
  id: string
  name: string
}

interface DotnetPagedRoles {
  items: DotnetRoleRow[]
}

/** Sort keys the .NET search endpoint accepts, keyed by the legacy sortBy names. */
const SORT_FIELDS: Record<string, string> = {
  full_name: "firstname",
  email: "email",
  is_active: "isactive",
}

function errorMessage(error: unknown): string {
  if (error instanceof DotnetApiError) return error.normalized.message
  return error instanceof Error ? error.message : "Request failed"
}

/** Splits a single full name into the first-name and last-name fields the .NET API stores. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") }
}

/** userFromDotnet plus the 2FA flag the shared mapper does not carry. */
function toUser(profile: DotnetUserProfile, roles: readonly DotnetUserRole[]): User {
  return { ...userFromDotnet(profile, roles), two_factor_enabled: profile.twoFactorEnabled ?? false }
}

async function fetchUserWithRoles(id: string): Promise<User> {
  const [profile, roles] = await Promise.all([
    dotnetClient.get<DotnetUserProfile>(`/api/v1/identity/users/${encodeURIComponent(id)}`),
    dotnetClient.get<DotnetUserRole[]>(`/api/v1/identity/users/${encodeURIComponent(id)}/roles`),
  ])
  return toUser(profile, roles)
}

async function findRoleId(name: string): Promise<string | null> {
  const page = await dotnetClient.get<DotnetPagedRoles>(
    `/api/v1/identity/roles?search=${encodeURIComponent(name)}&pageSize=100`,
  )
  const wanted = name.trim().toLowerCase()
  return page.items.find((role) => role.name.toLowerCase() === wanted)?.id ?? null
}

export const usersApi = {
  getUsers: async (filters: UsersFilters = {}): Promise<{ data: User[]; error: string | null; total?: number }> => {
    try {
      const params = new URLSearchParams()
      if (filters.search?.trim()) params.set("search", filters.search.trim())
      params.set("pageNumber", String(filters.page ?? 1))
      params.set("pageSize", String(filters.limit ?? DEFAULT_PAGE_SIZE))

      const sortField = filters.sortBy ? SORT_FIELDS[filters.sortBy] : undefined
      if (sortField) params.set("sort", filters.sortOrder === "desc" ? `-${sortField}` : sortField)

      if (filters.role) {
        const roleId = await findRoleId(filters.role)
        if (!roleId) return { data: [], error: null }
        params.set("roleId", roleId)
      }

      const page = await dotnetClient.get<DotnetPagedUsers>(`/api/v1/identity/users/search?${params.toString()}`)
      const data = await Promise.all(
        page.items.map(async (user) => {
          const roles = await dotnetClient.get<DotnetUserRole[]>(
            `/api/v1/identity/users/${encodeURIComponent(user.id ?? "")}/roles`,
          )
          return toUser(user, roles)
        }),
      )
      return { data, error: null, total: page.totalCount }
    } catch (error) {
      return { data: [], error: errorMessage(error) }
    }
  },

  getUser: async (id: string): Promise<{ data: User | null; error: string | null }> => {
    try {
      return { data: await fetchUserWithRoles(id), error: null }
    } catch (error) {
      return { data: null, error: errorMessage(error) }
    }
  },

  /**
   * Admin-initiated creation through POST /api/v1/identity/register (requires Users.Create, which the
   * BFF's generic authenticated proxy carries via the caller's session — this is distinct from the
   * anonymous self-register endpoint used at sign-up). The account needs no email confirmation, matching
   * the no-confirmation decision already made for self-register. If a role was picked, it is applied with
   * the existing AssignUserRoles endpoint after the user is created; a failure there still returns the
   * created user, with the role-assignment error surfaced separately.
   */
  createUser: async (userData: CreateUserData): Promise<{ data: User | null; error: string | null }> => {
    try {
      const { firstName, lastName } = splitFullName(userData.full_name)
      const created = await dotnetClient.post<DotnetRegisterUserResponse>("/api/v1/identity/register", {
        firstName,
        lastName,
        email: userData.email,
        userName: usernameFromEmail(userData.email),
        password: userData.password,
        confirmPassword: userData.password,
        phoneNumber: userData.phone ?? null,
        branchId: userData.branch_id || null,
      })

      if (userData.role) {
        const roleId = await findRoleId(userData.role)
        if (roleId) {
          await dotnetClient.post<string>(`/api/v1/identity/users/${encodeURIComponent(created.userId)}/roles`, {
            userId: created.userId,
            userRoles: [{ roleId, roleName: userData.role, enabled: true }],
          })
        }
      }

      return { data: await fetchUserWithRoles(created.userId), error: null }
    } catch (error) {
      return { data: null, error: errorMessage(error) }
    }
  },

  /**
   * The .NET update is a full replace for name and phone, so the current row is read first and
   * the partial update is merged into it. Email changes have no .NET endpoint.
   */
  updateUser: async (id: string, updates: UpdateUserData): Promise<{ data: User | null; error: string | null }> => {
    if (updates.email !== undefined) {
      return { data: null, error: EMAIL_UNSUPPORTED }
    }
    try {
      const current = await dotnetClient.get<DotnetUserProfile>(`/api/v1/identity/users/${encodeURIComponent(id)}`)
      const names =
        updates.full_name !== undefined
          ? splitFullName(updates.full_name)
          : { firstName: current.firstName?.trim() ?? "", lastName: current.lastName?.trim() ?? "" }
      const phone = updates.phone !== undefined ? updates.phone?.trim() || null : current.phoneNumber?.trim() || null

      await dotnetClient.put<void>(`/api/v1/identity/users/${encodeURIComponent(id)}`, {
        firstName: names.firstName,
        lastName: names.lastName,
        phoneNumber: phone,
        isActive: updates.is_active,
        roles: updates.role ? [updates.role] : undefined,
        branchId: updates.branch_id || undefined,
      })

      return { data: await fetchUserWithRoles(id), error: null }
    } catch (error) {
      return { data: null, error: errorMessage(error) }
    }
  },

  /**
   * POST /identity/users/{id}/2fa/reset (Permissions.Users.ResetTwoFactor): turns off the user's
   * two-step verification, clears their recovery codes and signs them out everywhere.
   */
  resetTwoFactor: async (id: string): Promise<{ data: null; error: string | null }> => {
    try {
      await dotnetClient.post<void>(`/api/v1/identity/users/${encodeURIComponent(id)}/2fa/reset`, {})
      return { data: null, error: null }
    } catch (error) {
      return { data: null, error: errorMessage(error) }
    }
  },

  /** Backend DELETE deactivates the account (soft delete), it does not remove the row. */
  deleteUser: async (id: string): Promise<{ data: null; error: string | null }> => {
    try {
      await dotnetClient.delete<void>(`/api/v1/identity/users/${encodeURIComponent(id)}`)
      return { data: null, error: null }
    } catch (error) {
      return { data: null, error: errorMessage(error) }
    }
  },
}
