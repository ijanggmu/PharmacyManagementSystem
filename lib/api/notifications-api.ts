/**
 * Notification calls for the header dropdown, switchable per backend target (NOTIFICATIONS).
 * The legacy path keeps the existing /api/notifications routes; the dotnet path calls the
 * .NET Notifications module. Both return the same UI shape, so the dropdown never sees the difference.
 */

import { getCSRFToken } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { dotnetClient } from "@/lib/api/dotnet-client"

export interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  link?: string | null
  is_read: boolean
  created_at: string
}

/** Shape of one row returned by the .NET Notifications module (NotificationDto). */
export interface DotnetNotificationDto {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  source: string
  metadataJson: string
  readAtUtc: string | null
  createdAtUtc: string
}

export function toNotificationItem(dto: DotnetNotificationDto): NotificationItem {
  return {
    id: dto.id,
    type: dto.type,
    title: dto.title,
    message: dto.body ?? "",
    link: dto.link,
    is_read: dto.readAtUtc !== null,
    created_at: dto.createdAtUtc,
  }
}

export async function listUnreadNotifications(limit: number): Promise<NotificationItem[]> {
  if (backendTarget("NOTIFICATIONS") === "dotnet") {
    const rows = await dotnetClient.get<DotnetNotificationDto[]>(`/api/v1/notifications?unreadOnly=true&pageSize=${limit}`)
    return rows.map(toNotificationItem)
  }
  const res = await fetch(`/api/notifications?unread=true&limit=${limit}`)
  if (!res.ok) return []
  const body = (await res.json()) as { data?: NotificationItem[] }
  return body.data ?? []
}

export async function markNotificationRead(id: string): Promise<void> {
  if (backendTarget("NOTIFICATIONS") === "dotnet") {
    await dotnetClient.post(`/api/v1/notifications/${id}/read`)
    return
  }
  const csrf = await getCSRFToken()
  await fetch(`/api/notifications/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
  })
}

export async function markAllNotificationsRead(): Promise<void> {
  if (backendTarget("NOTIFICATIONS") === "dotnet") {
    await dotnetClient.post("/api/v1/notifications/read-all")
    return
  }
  const csrf = await getCSRFToken()
  await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
  })
}
