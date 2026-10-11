/**
 * API Authentication Middleware (BFF)
 * Ensures BFF routes are protected. Identity comes from the .NET session (JWT cookies).
 */

import { NextRequest, NextResponse } from "next/server"
import type { Role } from "@/lib/security/rbac-types"
import { isSameOriginRequest, validateCSRFToken } from "@/lib/security/csrf"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { dotnetPermissionAllowed } from "@/lib/api/dotnet-permissions"

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string
    email?: string
    tenantId?: string
    role?: Role
    /** .NET permission names from the token's "permission" claims. */
    permissions?: string[]
  }
}

type AuthUser = {
  id: string
  email?: string
  tenantId?: string
  role?: Role
  permissions?: string[]
}

export async function requireAuth(request: NextRequest): Promise<{ user: AuthUser } | NextResponse> {
  try {
    const session = await getDotnetSession()
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      )
    }
    // Rotation (when the access token is near expiry) updates the shared, process-local token
    // store in place — see dotnet-server-session.ts. There is nothing left to write back here.
    return {
      user: {
        id: session.user.id,
        tenantId: session.user.tenantId ?? undefined,
        role: (session.user.role ?? undefined) as Role | undefined,
        permissions: session.user.permissions,
      },
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Authentication failed", message: "Unable to verify authentication" },
      { status: 401 }
    )
  }
}

/** Decides from the token's .NET permission claims. */
export async function requirePermission(
  request: NextRequest,
  permission: string
): Promise<{ user: AuthUser } | NextResponse> {
  const authResult = await requireAuth(request)

  if (authResult instanceof NextResponse) {
    return authResult
  }

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

  // Defence in depth on top of the token: refuse state-changing calls from another origin.
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json(
      { error: "Forbidden", message: "Cross-origin request rejected" },
      { status: 403 }
    )
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
