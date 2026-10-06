import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { clearTokenCookies } from "@/lib/api/dotnet-bff"

export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf
  return clearTokenCookies(NextResponse.json({ ok: true }))
}
