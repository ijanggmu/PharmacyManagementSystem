import { NextResponse } from "next/server"
import { getCSRFToken } from "@/lib/security/csrf"

export async function GET() {
  const token = await getCSRFToken()
  return NextResponse.json({ token })
}

