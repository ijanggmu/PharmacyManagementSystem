import { createBrowserClient } from "@supabase/ssr"

// Check if Supabase environment variables are available
export const isSupabaseConfigured = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return !!(url && anonKey && url.length > 0 && anonKey.length > 0)
}

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    console.error("Missing Supabase environment variables")
    // Return a dummy client to prevent crashes
    return {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
      from: () => ({ select: () => ({ data: [], error: null }) }),
    } as any
  }

  return createBrowserClient(url, anonKey)
}

// Create a singleton instance of the Supabase client for Client Components
let supabaseInstance: ReturnType<typeof createClient> | null = null

export const supabase = (() => {
  if (!supabaseInstance) {
    supabaseInstance = createClient()
  }
  return supabaseInstance
})()
