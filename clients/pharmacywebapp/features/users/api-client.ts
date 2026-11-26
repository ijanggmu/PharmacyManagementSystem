import { BaseFilters } from "@/lib/api/utils"
import { DotnetApiError, dotnetClient } from "@/lib/api/dotnet-client"
import { jobRoleNames, jobRolesSet, userFromDotnet, type DotnetUserProfile, type DotnetUserRole } from "@/lib/api/dashboard-dotnet"
import { usernameFromEmail } from "@/lib/api/auth-api"

export interface User {
  id: string
  email: string
  full_name: string
  /** The main job role, for badges and sorting (first of `roles`, else Basic). */
  role: string
  /** Every job role the user holds (Basic, which everyone has, is left out). */
  roles: string[]
  phone: string | null
  is_active?: boolean
  /** Set when an administrator deleted the account. */
  deleted_at?: string | null
  /** Branch the user works in; null means the tenant's default branch. */
  branch_id?: string | null
  /** Authenticator (TOTP) sign-in is on for this account. */
  two_factor_enabled?: boolean
  created_at: string
  updated_at: string
}

export interface UsersFilters extends BaseFilters {
  role?: string
  /** true lists only deleted accounts; otherwise they are left out. */
  deleted?: boolean
}

export interface CreateUserData {
  email: string
  full_name: string
  /** Job roles to give the user (Basic is always added). */
  roles: string[]
  phone?: string | null
  password: string
  /** Branch the user works in. Omit to use the tenant's default branch. */
  branch_id?: string | null
}

export interface UpdateUserData {
  email?: string
  full_name?: string
  /** Replaces the user's job roles (Basic is always kept). Omit to leave roles unchanged. */
  roles?: string[]
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

/** userFromDotnet plus the fields the shared mapper does not carry (all job roles, 2FA, deletion). */
export function toUser(profile: DotnetUserProfile, roles: readonly DotnetUserRole[]): User {
  return {
    ...userFromDotnet(profile, roles),
    roles: jobRoleNames(roles),
    two_factor_enabled: profile.twoFactorEnabled ?? false,
    deleted_at: profile.deletedOnUtc ?? null,
  }
}

/** The AssignUserRoles body: every role row with `enabled` set for the chosen job roles plus Basic. */
export function roleAssignment(allRoles: readonly DotnetUserRole[], chosen: readonly string[]): DotnetUserRole[] {
  const wanted = new Set(jobRolesSet(chosen).map((name) => name.toLowerCase()))
  return allRoles
    .filter((role) => role.roleId && role.roleName)
    .map((role) => ({ ...role, enabled: wanted.has(role.roleName!.toLowerCase()) }))
}

/** Largest page the users search returns (ToPagedResponseAsync caps at 100). */
const EXPORT_PAGE_SIZE = 100

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
  getUsers: async (
    filters: UsersFilters = {},
  ): Promise<{ data: User[]; error: string | null; total?: number; totalPages?: number }> => {
    try {
      const params = new URLSearchParams()
      if (filters.search?.trim()) params.set("search", filters.search.trim())
      if (filters.deleted) params.set("deleted", "true")
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
      return { data, error: null, total: page.totalCount, totalPages: page.totalPages }
    } catch (error) {
      return { data: [], error: errorMessage(error) }
    }
  },

  /** Every user matching the filters, for export (the table itself shows one page). Throws on failure. */
  getAllUsers: async (filters: UsersFilters = {}): Promise<User[]> => {
    const all: User[] = []
    for (let page = 1; ; page++) {
      const result = await usersApi.getUsers({ ...filters, page, limit: EXPORT_PAGE_SIZE })
      if (result.error) throw new Error(result.error)
      all.push(...result.data)
      if (page >= (result.totalPages ?? 1) || result.data.length === 0) return all
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

      if (userData.roles.length > 0) {
        // The user's role rows (every tenant role, `enabled` = member), switched on for the chosen ones.
        const rows = await dotnetClient.get<DotnetUserRole[]>(`/api/v1/identity/users/${encodeURIComponent(created.userId)}/roles`)
        await dotnetClient.post<string>(`/api/v1/identity/users/${encodeURIComponent(created.userId)}/roles`, {
          userId: created.userId,
          userRoles: roleAssignment(rows, userData.roles),
        })
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
        // The server replaces the whole role set: keep the minimal Basic role every user holds next to the job roles.
        roles: updates.roles ? jobRolesSet(updates.roles) : undefined,
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

  /**
   * POST /identity/users/{id}/password (Users.Update, Admin only): sets a new password for another user,
   * signs them out everywhere and clears any lockout. The API applies the password policy.
   */
  setPassword: async (id: string, newPassword: string): Promise<{ data: null; error: string | null }> => {
    try {
      await dotnetClient.post<void>(`/api/v1/identity/users/${encodeURIComponent(id)}/password`, {
        userId: id,
        newPassword,
        confirmNewPassword: newPassword,
      })
      return { data: null, error: null }
    } catch (error) {
      return { data: null, error: errorMessage(error) }
    }
  },

  /**
   * DELETE marks the account deleted: it can't sign in, drops off the user list, and its email is freed.
   * The row stays so past sales and audit entries keep the person's name.
   */
  deleteUser: async (id: string): Promise<{ data: null; error: string | null }> => {
    try {
      await dotnetClient.delete<void>(`/api/v1/identity/users/${encodeURIComponent(id)}`)
      return { data: null, error: null }
    } catch (error) {
      return { data: null, error: errorMessage(error) }
    }
  },
}
