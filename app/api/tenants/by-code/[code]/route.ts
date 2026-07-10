import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getActiveTenantByCode } from "@/lib/server/services/tenant-service"

/**
 * GET /api/tenants/by-code/[code] – Public: resolve tenant by slug/code (name only).
 * Used on login page to show pharmacy name when user enters a pharmacy code.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code" }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await getActiveTenantByCode(supabase, code)

  if (error || !data) {
    return NextResponse.json({ name: null, code: null }, { status: 200 })
  }

  return NextResponse.json({ name: data.name, code: data.code })
}
