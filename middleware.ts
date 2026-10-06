import { updateSession } from "@/lib/supabase/middleware"
import { updateDotnetSession } from "@/lib/api/dotnet-middleware"
import { backendTarget } from "@/lib/api/backend-target"
import { getTenantCodeFromHost, getTenantRootDomainFromEnv } from "@/lib/tenant-host"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host")
  const rootDomain = getTenantRootDomainFromEnv()
  const tenantCodeFromHost = getTenantCodeFromHost(host, rootDomain)

  const response =
    backendTarget("AUTH") === "dotnet"
      ? await updateDotnetSession(request, { tenantCodeFromHost })
      : await updateSession(request, { tenantCodeFromHost })

  // Tenant subdomain: ensure sign-in URL carries pharmacy code (same host).
  if (response.status === 200 && tenantCodeFromHost) {
    const url = request.nextUrl.clone()
    const { pathname } = url
    const isRoot = pathname === "/"

    if (isRoot) {
      const auth = url.searchParams.get("auth")
      const code = url.searchParams.get("code")
      const needsTenantSignin =
        auth !== "signin" ||
        !code ||
        code.trim().toLowerCase() !== tenantCodeFromHost.toLowerCase()

      if (needsTenantSignin) {
        const authMode = url.searchParams.get("auth")
        // Allow onboarding / forgot-password flows on marketing-style links only; tenant host forces tenant sign-in.
        if (authMode === "onboarding" || authMode === "forgot" || authMode === "forgot-password") {
          return response
        }
        url.searchParams.set("auth", "signin")
        url.searchParams.set("code", tenantCodeFromHost.toLowerCase())
        return NextResponse.redirect(url)
      }
    }
  }

  return response
}

export const config = {
  // /api is excluded: middleware's own redirect logic explicitly never fires for API
  // paths (see `isApiRoute` checks above — neither branch can match), so running the
  // full Supabase Auth verification here for every API call was pure overhead. Every
  // API route already does its own independent auth check via requireAuth()/
  // requirePermission(), which is the one that actually matters and enforces access.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
