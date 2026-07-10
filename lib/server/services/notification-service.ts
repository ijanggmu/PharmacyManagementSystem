/**
 * Server-only notification persistence. Used by `app/api/notifications/*` Route Handlers.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface NotificationRecord {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
}

export interface ListNotificationsInput {
  userId: string
  onlyUnread: boolean
  page: number
  limit: number
}

export function parseListNotificationsInput(
  searchParams: URLSearchParams,
  userId: string
): ListNotificationsInput {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20))
  return {
    userId,
    onlyUnread: searchParams.get("unread") === "true",
    page,
    limit,
  }
}

export async function listNotificationsForUser(
  supabase: SupabaseClient,
  input: ListNotificationsInput
): Promise<{ data: NotificationRecord[]; count: number; error: Error | null }> {
  const from = (input.page - 1) * input.limit
  const to = from + input.limit - 1

  let query = supabase
    .from("notifications")
    .select("id, type, title, message, link, is_read, created_at", { count: "exact" })
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (input.onlyUnread) {
    query = query.eq("is_read", false)
  }

  const { data, error, count } = await query
  if (error) {
    return { data: [], count: 0, error: new Error(error.message) }
  }
  return { data: (data as NotificationRecord[]) || [], count: count ?? 0, error: null }
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  userId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false)

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", userId)

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}
