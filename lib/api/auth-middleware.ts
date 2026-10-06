/**
 * API Authentication Middleware
 * Ensures all API routes are protected with authentication
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ROLE_PERMISSIONS, type Permission, type Role } from "@/lib/security/rbac-types"
import { validateCSRFToken } from "@/lib/security/csrf"
import { backendTarget } from "@/lib/api/backend-target"
import { cookies } from "next/headers"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { isSecureRequest } from "@/lib/api/dotnet-bff"
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  jwtExpiry,
  sessionCookieOptions,
  type TokenPair,
} from "@/lib/api/dotnet-session"
import { dotnetPermissionAllowed } from "@/lib/api/dotnet-permissions"

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string
    email?: string
    tenantId?: string
    role?: Role
    /** .NET permission names from the token's "permission" claims. Set on the dotnet path only. */
    permissions?: string[]
  }
}

/**
 * Writes rotated .NET tokens into the request's cookie store so the browser keeps the new pair.
 * Route handlers allow this. Server Components do not, so the write is skipped there and the
 * middleware rotation stays the source of truth.
 */
async function persistRotatedTokens(tokens: TokenPair, secure: boolean): Promise<void> {
  try {
    const store = await cookies()
    const accessExpiry = jwtExpiry(tokens.accessToken) ?? new Date(Date.now() + 15 * 60_000)
    store.set(ACCESS_COOKIE, tokens.accessToken, sessionCookieOptions(accessExpiry, secure))
    store.set(REFRESH_COOKIE, tokens.refreshToken, sessionCookieOptions(tokens.refreshTokenExpiresAt, secure))
  } catch {
    // Called from a context that cannot write cookies (a Server Component). Nothing to persist.
  }
}

export async function requireAuth(
  request: NextRequest
): Promise<
  {
    user: {
      id: string
      email?: string
      tenantId?: string
      role?: Role
      permissions?: string[]
    }
  } | NextResponse
> {
  try {
    if (backendTarget("AUTH") === "dotnet") {
      const session = await getDotnetSession()
      if (!session) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Authentication required" },
          { status: 401 }
        )
      }
      if (session.rotated) {
        await persistRotatedTokens(session.rotated, isSecureRequest(request))
      }
      return {
        user: {
          id: session.user.id,
          tenantId: session.user.tenantId ?? undefined,
          role: (session.user.role ?? undefined) as Role | undefined,
          permissions: session.user.permissions,
        },
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      )
    }

    // Load application user to get tenant and role context
    const { data: appUser, error: appUserError } = await supabase
      .from("users")
      .select("id, tenant_id, role, is_active")
      .eq("id", user.id)
      .single()

    if (appUserError || !appUser) {
      return NextResponse.json(
        { error: "Forbidden", message: "User record not found for current session" },
        { status: 403 }
      )
    }

    // Deactivated accounts (see users.is_active) are blocked from every API call, not
    // just login — closes the gap where a removed employee's session, if still valid,
    // could keep acting until it expired.
    if ((appUser as { is_active?: boolean }).is_active === false) {
      return NextResponse.json(
        { error: "Forbidden", message: "This account has been deactivated. Contact your administrator." },
        { status: 403 }
      )
    }

    return {
      user: {
        id: user.id,
        email: user.email ?? undefined,
        tenantId: (appUser as any).tenant_id ?? undefined,
        role: (appUser as any).role as Role | undefined,
      },
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Authentication failed", message: "Unable to verify authentication" },
      { status: 401 }
    )
  }
}

export async function requirePermission(
  request: NextRequest,
  permission: string
): Promise<
  {
    user: {
      id: string
      email?: string
      tenantId?: string
      role?: Role
      permissions?: string[]
    }
  } | NextResponse
> {
  const authResult = await requireAuth(request)

  if (authResult instanceof NextResponse) {
    return authResult
  }

  // .NET path: decide from the token's permission claims only. The Supabase role map is not consulted.
  if (backendTarget("AUTH") === "dotnet") {
    try {
      if (!dotnetPermissionAllowed(permission, authResult.user.permissions ?? [])) {
        return NextResponse.json(
          { error: "Forbidden", message: "Insufficient permissions" },
          { status: 403 }
        )
      }
      return authResult
    } catch {
      return NextResponse.json(
        { error: "Forbidden", message: "Permission check failed" },
        { status: 403 }
      )
    }
  }

  try {
    // Prefer role from authResult to avoid duplicate lookups
    if (!authResult.user.role) {
      return NextResponse.json(
        { error: "Forbidden", message: "Unable to verify user permissions" },
        { status: 403 }
      )
    }

    // Superadmin has all permissions
    const role = authResult.user.role as Role
    if (role === "superadmin") {
      return authResult
    }

    const permissions = ROLE_PERMISSIONS[role] || []
    if (!permissions.includes(permission as Permission)) {
      return NextResponse.json(
        { error: "Forbidden", message: "Insufficient permissions" },
        { status: 403 }
      )
    }

    return authResult
  } catch (error) {
    return NextResponse.json(
      { error: "Forbidden", message: "Permission check failed" },
      { status: 403 }
    )
  }
}

/**
 * Re-verifies the current user's password for step-up confirmation on
 * destructive actions (e.g. hard-deleting a tenant that has real data).
 * Uses a throwaway, non-persisted auth client so it never touches the
 * request's actual session cookies.
 */
export async function verifyUserPassword(email: string, password: string): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) return false

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await client.auth.signInWithPassword({ email, password })
  return !error
}

/**
 * Validates CSRF token for state-changing requests (POST, PUT, DELETE, PATCH)
 */
export async function requireCSRF(
  request: NextRequest
): Promise<NextResponse | null> {
  const method = request.method
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return null // CSRF not required for GET requests
  }

  // Try to get CSRF token from header first, then from body
  let csrfToken = request.headers.get("x-csrf-token")
  
  if (!csrfToken) {
    try {
      const body = await request.clone().json()
      csrfToken = body.csrfToken
    } catch {
      // Body might not be JSON or might be empty
    }
  }

  if (!csrfToken || typeof csrfToken !== "string") {
    return NextResponse.json(
      { error: "Forbidden", message: "CSRF token required" },
      { status: 403 }
    )
  }

  const isValid = await validateCSRFToken(csrfToken)
  if (!isValid) {
    return NextResponse.json(
      { error: "Forbidden", message: "Invalid CSRF token" },
      { status: 403 }
    )
  }

  return null // CSRF validation passed
}

