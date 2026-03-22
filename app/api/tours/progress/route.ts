import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAuth } from "@/lib/api/auth-middleware"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { errorResponse, successResponse } from "@/lib/api/response-utils"

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof Response) {
    // NextResponse is also a Response instance.
    return authResult
  }

  const url = new URL(request.url)
  const raw = url.searchParams.get("tourKeys") || ""
  const tourKeys = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50)

  if (tourKeys.length === 0) {
    return successResponse({ completedTourKeys: [] })
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("user_tour_progress")
      .select("tour_key")
      .eq("user_id", authResult.user.id)
      .in("tour_key", tourKeys)

    if (error) {
      return errorResponse("TOUR_PROGRESS_LOOKUP_FAILED", error.message, { status: 500 })
    }

    const completedTourKeys = (data || []).map((row: any) => row.tour_key)
    return successResponse({ completedTourKeys })
  } catch (e: any) {
    return errorResponse("TOUR_PROGRESS_LOOKUP_FAILED", e?.message || "Failed to load tour progress", {
      status: 500,
    })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const tourKeys = (Array.isArray(body?.tourKeys) ? body.tourKeys : []).map(String).slice(0, 50)

    if (tourKeys.length === 0) {
      return errorResponse("VALIDATION_ERROR", "tourKeys is required", { status: 400 })
    }

    const supabase = createServiceClient()

    const rows = tourKeys.map((tourKey: string) => ({
      user_id: authResult.user.id,
      tour_key: tourKey,
    }))

    const { error } = await supabase.from("user_tour_progress").upsert(rows, { onConflict: "user_id,tour_key" })
    if (error) {
      return errorResponse("TOUR_PROGRESS_UPDATE_FAILED", error.message, { status: 500 })
    }

    return successResponse({ updated: true })
  } catch (e: any) {
    return errorResponse("TOUR_PROGRESS_UPDATE_FAILED", e?.message || "Failed to update tour progress", {
      status: 500,
    })
  }
}

