import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { processIrdQueueBatch } from "@/lib/api/ird-service"

export async function POST(request: NextRequest) {
  const start = Date.now()

  // Simple shared-secret protection so only your cron/worker can call this
  const expectedSecret = process.env.IRD_CRON_SECRET
  const providedSecret = request.headers.get("x-ird-cron-secret")

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing IRD cron secret" },
      { status: 401 },
    )
  }

  try {
    const supabase = createServiceClient()

    const { searchParams } = new URL(request.url)
    const batchSizeParam = searchParams.get("batchSize")
    const maxAttemptsParam = searchParams.get("maxAttempts")

    const batchSize = batchSizeParam ? Number.parseInt(batchSizeParam, 10) : undefined
    const maxAttempts = maxAttemptsParam ? Number.parseInt(maxAttemptsParam, 10) : undefined

    const result = await processIrdQueueBatch(supabase, {
      batchSize: Number.isFinite(batchSize) && batchSize ? batchSize : undefined,
      maxAttempts: Number.isFinite(maxAttempts) && maxAttempts ? maxAttempts : undefined,
    })

    const duration = Date.now() - start

    return NextResponse.json(
      {
        ok: true,
        durationMs: duration,
        ...result,
      },
      { status: 200 },
    )
  } catch (error: any) {
    const duration = Date.now() - start
    return NextResponse.json(
      {
        ok: false,
        durationMs: duration,
        error: error?.message || "Failed to process IRD invoice queue",
      },
      { status: 500 },
    )
  }
}

