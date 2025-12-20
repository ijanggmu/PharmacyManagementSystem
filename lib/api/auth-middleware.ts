/**
 * API Authentication Middleware
 * Ensures all API routes are protected with authentication
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ROLE_PERMISSIONS, type Permission, type Role } from "@/lib/security/rbac-types"
import { validateCSRFToken } from "@/lib/security/csrf"

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string
    email?: string
  }
}

export async function requireAuth(
  request: NextRequest
): Promise<{ user: { id: string; email?: string } } | NextResponse> {
  try {
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

    return { user: { id: user.id, email: user.email } }
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
): Promise<{ user: { id: string; email?: string } } | NextResponse> {
  const authResult = await requireAuth(request)
  
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const supabase = await createClient()
    
    // Get user role from database
    const { data: userData, error } = await supabase
      .from("users")
      .select("role")
      .eq("id", authResult.user.id)
      .single()

    if (error || !userData?.role) {
      return NextResponse.json(
        { error: "Forbidden", message: "Unable to verify user permissions" },
        { status: 403 }
      )
    }

    // Check permissions based on user role
    const role = userData.role as Role
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

