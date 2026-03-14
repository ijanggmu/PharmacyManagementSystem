import type { SupabaseClient } from "@supabase/supabase-js"

export type IrdAuthType = "basic" | "bearer"

export interface IrdTenantConfig {
  baseUrl: string
  endpointPath: string
  authType: IrdAuthType
  username?: string
  password?: string
  token?: string
  timeoutMs?: number
}

export interface IrdInvoiceQueueRecord {
  id: string
  tenant_id: string
  sale_id: string
  payload: any
  status: string
  attempts: number
  last_error: string | null
}

export interface ProcessIrdQueueOptions {
  batchSize?: number
  maxAttempts?: number
}

export interface ProcessIrdQueueResult {
  processed: number
  succeeded: number
  failed: number
  errors: { id: string; message: string }[]
}

async function getTenantIrdConfig(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<IrdTenantConfig> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value, type")
    .eq("tenant_id", tenantId)
    .eq("key", "ird_cbms_config")
    .single()

  if (error || !data) {
    throw new Error("IRD CBMS configuration not found for tenant")
  }

  let config: IrdTenantConfig | null = null
  if (data.type === "json") {
    try {
      config = JSON.parse(data.value) as IrdTenantConfig
    } catch {
      throw new Error("Invalid IRD CBMS configuration JSON for tenant")
    }
  } else {
    throw new Error("IRD CBMS configuration must be stored as JSON type")
  }

  if (!config.baseUrl || !config.endpointPath || !config.authType) {
    throw new Error("Incomplete IRD CBMS configuration for tenant")
  }

  return config
}

async function sendInvoiceToIrd(
  config: IrdTenantConfig,
  payload: any,
): Promise<{ externalId?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15000)

  try {
    const url = new URL(config.endpointPath, config.baseUrl).toString()

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (config.authType === "basic") {
      if (!config.username || !config.password) {
        throw new Error("Missing username/password for IRD basic auth")
      }
      const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64")
      headers.Authorization = `Basic ${encoded}`
    } else if (config.authType === "bearer") {
      if (!config.token) {
        throw new Error("Missing bearer token for IRD auth")
      }
      headers.Authorization = `Bearer ${config.token}`
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const text = await res.text()
    let body: any = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      // keep raw text in case of non-JSON response
    }

    if (!res.ok) {
      const message =
        (body && (body.error || body.message)) ||
        `IRD CBMS responded with status ${res.status}`
      throw new Error(message)
    }

    const externalId = body?.invoiceId || body?.id || undefined
    return { externalId }
  } finally {
    clearTimeout(timeout)
  }
}

function computeNextAttemptAt(attempts: number): string {
  // Exponential backoff in minutes: 1, 5, 15, 30, 60...
  const schedule = [1, 5, 15, 30, 60]
  const minutes = schedule[Math.min(attempts, schedule.length - 1)]
  const next = new Date()
  next.setMinutes(next.getMinutes() + minutes)
  return next.toISOString()
}

export async function processIrdQueueBatch(
  supabase: SupabaseClient,
  options: ProcessIrdQueueOptions = {},
): Promise<ProcessIrdQueueResult> {
  const batchSize = options.batchSize ?? 10
  const maxAttempts = options.maxAttempts ?? 5

  const { data: queueItems, error: queueError } = await supabase
    .from("ird_invoice_queue")
    .select("*")
    .eq("status", "pending")
    .or("next_attempt_at.is.null,next_attempt_at.lte.now()")
    .order("created_at", { ascending: true })
    .limit(batchSize)

  if (queueError) {
    throw new Error(queueError.message)
  }

  if (!queueItems || queueItems.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, errors: [] }
  }

  let succeeded = 0
  let failed = 0
  const errors: { id: string; message: string }[] = []

  for (const item of queueItems as IrdInvoiceQueueRecord[]) {
    const attempts = item.attempts ?? 0

    try {
      const config = await getTenantIrdConfig(supabase, item.tenant_id)
      const { externalId } = await sendInvoiceToIrd(config, item.payload)

      // Mark queue item as sent
      await supabase
        .from("ird_invoice_queue")
        .update({
          status: "sent",
          attempts: attempts + 1,
          last_error: null,
          next_attempt_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)

      // Update sale IRD status & identifiers
      await supabase
        .from("sales")
        .update({
          ird_status: "synced",
          ird_invoice_id: externalId ?? item.payload?.invoiceNumber ?? null,
          ird_synced_at: new Date().toISOString(),
          ird_error: null,
        })
        .eq("id", item.sale_id)
        .eq("tenant_id", item.tenant_id)

      succeeded += 1
    } catch (error: any) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown IRD error"

      const newAttempts = attempts + 1
      const isFinal = newAttempts >= maxAttempts

      await supabase
        .from("ird_invoice_queue")
        .update({
          status: isFinal ? "failed" : "pending",
          attempts: newAttempts,
          last_error: message,
          next_attempt_at: isFinal ? null : computeNextAttemptAt(newAttempts),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)

      await supabase
        .from("sales")
        .update({
          ird_status: isFinal ? "failed" : "pending",
          ird_error: message,
        })
        .eq("id", item.sale_id)
        .eq("tenant_id", item.tenant_id)

      failed += 1
      errors.push({ id: item.id, message })
    }
  }

  return {
    processed: queueItems.length,
    succeeded,
    failed,
    errors,
  }
}

