/**
 * API Authentication Middleware
 * Ensures all API routes are protected with authentication
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

  // TODO: Implement permission checking
  // For now, just return the user
  // In production, check user permissions from database
  
  return authResult
}

