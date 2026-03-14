import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"

// GET /api/notifications - list notifications for current user
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const onlyUnread = searchParams.get("unread") === "true"
    const limit = parseInt(searchParams.get("limit") || "20", 10)

    let query = supabase
      .from("notifications")
      .select("id, type, title, message, link, is_read, created_at")
      .eq("user_id", authResult.user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (onlyUnread) {
      query = query.eq("is_read", false)
    }

    const { data, error } = await query
    if (error) {
      return Errors.INTERNAL_ERROR(error.message)
    }

    return successResponse(data || [])
  } catch (error: any) {
    return Errors.INTERNAL_ERROR(error?.message || "Failed to load notifications")
  }
}

// PATCH /api/notifications - mark all as read
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", authResult.user.id)
      .eq("is_read", false)

    if (error) {
      return Errors.INTERNAL_ERROR(error.message)
    }

    return successResponse({ updated: true })
  } catch (error: any) {
    return Errors.INTERNAL_ERROR(error?.message || "Failed to update notifications")
  }
}

