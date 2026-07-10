import { NextRequest, NextResponse } from "next/server"
import { successResponse } from "@/lib/api/response-utils"
import { createClient } from "@/lib/supabase/server"
import { getUserTenantAndRole } from "@/lib/server/services/user-service"

export async function GET(request: NextRequest) {
  // Intentionally NOT protected: callers (landing page, exports) may probe session state.
  // Returns 200 with user=null when unauthenticated to avoid noisy 401s in the UI.
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user

  if (!user) {
    return successResponse({ user: null })
  }

  const { data: appUser } = await getUserTenantAndRole(supabase, user.id)

  return successResponse({
    user: {
      id: user.id,
      email: user.email ?? undefined,
      role: (appUser?.role as string | null) ?? null,
      tenantId: (appUser?.tenant_id as string | null) ?? null,
    },
  })
}

