/**
 * API Middleware
 * Rate limiting and request validation middleware for API routes
 */

import { NextRequest, NextResponse } from "next/server"

// Simple in-memory rate limiting (for production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
}

export function rateLimit(request: NextRequest): NextResponse | null {
  const ip = request.ip || request.headers.get("x-forwarded-for") || "unknown"
  const now = Date.now()

  const record = rateLimitMap.get(ip)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT.windowMs,
    })
    return null
  }

  if (record.count >= RATE_LIMIT.maxRequests) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    )
  }

  record.count++
  return null
}

// Clean up old rate limit records periodically
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip)
    }
  }
}, RATE_LIMIT.windowMs)

