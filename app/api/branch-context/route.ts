import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { getUserBranchContext, listBranchesForContext, switchUserBranch } from "@/lib/server/services/tenant-branch"

const switchBranchSchema = z.object({
  branchId: z.string().trim().min(1, "branchId is required"),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  try {
    const supabase = await createClient()
    const { data: userRow } = await getUserBranchContext(supabase, authResult.user.id)
    if (!userRow?.tenant_id) return successResponse({ branches: [], currentBranchId: null })

    const { data: branches } = await listBranchesForContext(supabase, userRow.tenant_id)

    return successResponse({ branches: branches || [], currentBranchId: userRow.current_branch_id || null })
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to load branches")
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const rawBody = await request.json().catch(() => ({}))
    const { branchId } = switchBranchSchema.parse(rawBody)

    const supabase = await createClient()
    const { error } = await switchUserBranch(supabase, authResult.user.id, branchId)
    if (error) return Errors.DATABASE_ERROR(error.message)

    return successResponse({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Errors.VALIDATION_ERROR(e.errors)
    }
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to switch branch")
  }
}

