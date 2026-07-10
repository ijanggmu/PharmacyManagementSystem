import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import {
  listNotificationsForUser,
  markAllNotificationsRead,
  parseListNotificationsInput,
} from "@/lib/server/services/notification-service"

// GET /api/notifications - list notifications for current user
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const input = parseListNotificationsInput(searchParams, authResult.user.id)

    const { data, error, count } = await listNotificationsForUser(supabase, input)
    if (error) {
      return Errors.INTERNAL_ERROR(error.message)
    }

    return successResponse(data, {
      meta: {
        page: input.page,
        limit: input.limit,
        total: count,
        totalPages: Math.ceil(count / input.limit),
      },
    })
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
    const { error } = await markAllNotificationsRead(supabase, authResult.user.id)

    if (error) {
      return Errors.INTERNAL_ERROR(error.message)
    }

    return successResponse({ updated: true })
  } catch (error: any) {
    return Errors.INTERNAL_ERROR(error?.message || "Failed to update notifications")
  }
}
