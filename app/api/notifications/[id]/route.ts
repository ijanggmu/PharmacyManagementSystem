import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { markNotificationRead } from "@/lib/server/services/notification-service"

// PATCH /api/notifications/[id] - mark a single notification as read
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const supabase = await createClient()
    const { id } = await params

    const { error } = await markNotificationRead(supabase, authResult.user.id, id)

    if (error) {
      return Errors.INTERNAL_ERROR(error.message)
    }

    return successResponse({ updated: true })
  } catch (error: any) {
    return Errors.INTERNAL_ERROR(error?.message || "Failed to update notification")
  }
}
