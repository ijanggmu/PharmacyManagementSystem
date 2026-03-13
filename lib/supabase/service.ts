import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js"

let serviceClient: SupabaseClient | null = null

export const createServiceClient = () => {
  if (serviceClient) return serviceClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error("Supabase service role environment variables are not set")
  }

  serviceClient = createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return serviceClient
}

