import { updateDotnetSession } from "@/lib/api/dotnet-middleware"
import { getTenantCodeFromHost, getTenantRootDomainFromEnv } from "@/lib/tenant-host"
import { NextResponse, type NextRequest } from "next/server"

// Next's "proxy" convention (replacing the deprecated "middleware" one) always runs on the Node.js
// runtime, not a separate Edge sandbox — required here because dotnet-token-store.ts talks to Redis
// (or, in dev, a process-local Map) shared with the API routes (also Node.js).
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")
  const rootDomain = getTenantRootDomainFromEnv()
  const tenantCodeFromHost = getTenantCodeFromHost(host, rootDomain)

  const response = await updateDotnetSession(request, { tenantCodeFromHost })

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
  // /api is excluded: BFF routes do their own auth check via requireAuth()/requirePermission().
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|apple-icon|manifest.json|.*.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
