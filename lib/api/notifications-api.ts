/**
 * Notification calls for the header dropdown, on the .NET Notifications module.
 */

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
  const rows = await dotnetClient.get<DotnetNotificationDto[]>(`/api/v1/notifications?unreadOnly=true&pageSize=${limit}`)
  return rows.map(toNotificationItem)
}

export async function markNotificationRead(id: string): Promise<void> {
  await dotnetClient.post(`/api/v1/notifications/${id}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await dotnetClient.post("/api/v1/notifications/read-all")
}

/** Soft-deletes a single notification owned by the caller (DELETE /api/v1/notifications/{id}). */
export async function deleteNotification(id: string): Promise<void> {
  await dotnetClient.delete(`/api/v1/notifications/${id}`)
}
