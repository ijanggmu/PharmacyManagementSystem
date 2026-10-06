import { NextResponse } from "next/server"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { applyTokenCookies, isSecureRequest, problem } from "@/lib/api/dotnet-bff"
import type { NextRequest } from "next/server"

/** Returns the signed-in user's id, tenant and roles from the httpOnly session. No bearer token is returned. */
export async function GET(request: NextRequest) {
  const session = await getDotnetSession()
  if (!session) return problem(401, "UNAUTHENTICATED", "Sign in required")
  const response = NextResponse.json({ user: session.user })
  return session.rotated ? applyTokenCookies(response, session.rotated, isSecureRequest(request)) : response
}
