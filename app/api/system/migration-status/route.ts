import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { getMigrationStatus } from "@/lib/server/services/system-diagnostics-service"

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const supabase = await createClient()
    const { data, error } = await getMigrationStatus(supabase)
    if (error) return Errors.INTERNAL_ERROR(error.message)

    return successResponse(data)
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to load migration status")
  }
}
