import { NextResponse } from "next/server"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { problem } from "@/lib/api/dotnet-bff"
import { isSuperAdmin } from "@/lib/api/dotnet-session"

/**
 * Returns the signed-in user's id, tenant and roles from the httpOnly session. No bearer token is
 * returned. The backend has no literal "SuperAdmin" role (see isSuperAdmin), but the dashboard nav and
 * every other role string it compares against (rbac-types Role) expect the lowercase "superadmin"
 * string. So a SuperAdmin session gets `role: "superadmin"` here for the dashboard to key its nav on,
 * while `roles`/`permissions` keep the real backend values the API permission checks rely on.
 */
export async function GET() {
  const session = await getDotnetSession()
  if (!session) return problem(401, "UNAUTHENTICATED", "Sign in required")
  const user = isSuperAdmin(session.user) ? { ...session.user, role: "superadmin" } : session.user
  // Rotation (when near expiry) updates the shared, process-local token store in place — see
  // dotnet-server-session.ts. There is nothing left to write back here.
  return NextResponse.json({ user })
}
