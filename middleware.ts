import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  // Only handle Supabase session and auth redirects.
  // Tenant routing is path-based via /t/[slug]/... and does not rely on subdomains
  // on the default *.vercel.app domain.
  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
