import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export type SessionMiddlewareOptions = {
  /** When set (tenant subdomain), unauthenticated redirects include ?code= for tenant login. */
  tenantCodeFromHost?: string | null
}

export async function updateSession(request: NextRequest, options?: SessionMiddlewareOptions) {
  const tenantCodeFromHost = options?.tenantCodeFromHost?.trim().toLowerCase() || null
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  // getUser() alone already validates the session against Supabase Auth and
  // transparently refreshes an expired token as part of that call — calling
  // refreshSession() first was a second, fully redundant network round-trip to
  // Supabase on every single request (page loads and API calls alike).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/auth/login") ||
    request.nextUrl.pathname.startsWith("/auth/sign-up") ||
    request.nextUrl.pathname === "/auth/callback" ||
    /^\/t\/[^/]+\/login$/.test(request.nextUrl.pathname)

  const isPublicRoute = request.nextUrl.pathname === "/" || request.nextUrl.pathname.startsWith("/onboarding")

  // API routes handle their own auth (returning JSON 401s); never redirect them to the
  // login page, or client fetches like /api/auth/session would silently follow the 307 to
  // the homepage (200) and misread it as an authenticated session.
  const isApiRoute = request.nextUrl.pathname.startsWith("/api")

  // If user is authenticated and trying to access auth pages, redirect to dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  // If user is not authenticated and trying to access protected routes, redirect to login
  if (!user && !isAuthRoute && !isPublicRoute && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.searchParams.set("auth", "signin")
    if (tenantCodeFromHost) {
      url.searchParams.set("code", tenantCodeFromHost)
    }
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
