"use client"

import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  getTicket,
  getTicketAcrossTenants,
  listTicketComments,
  listTicketCommentsAcrossTenants,
  addTicketComment,
  assignTicket,
  resolveTicket,
  reopenTicket,
  closeTicket,
  ticketErrorMessage,
  canAssignTickets,
  type DotnetTicketDto,
  type DotnetTicketCommentDto,
  type TicketStatus,
} from "@/lib/api/tickets-api"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { usersApi, type User } from "@/features/users/api-client"
import { isPermissionErrorMessage } from "@/features/tickets/lib/ticket-list-utils"
import { ticketActionAccess } from "@/features/tickets/lib/ticket-access"

export const NO_ASSIGNEE = "__unassigned__"

export type TicketAction = "assign" | "resolve" | "reopen" | "close"

export interface UseTicketDetailOptions {
  ticketId: string
  /**
   * Opened from the SuperAdmin "All tenants' tickets" desk: the tenant-scoped endpoints can't see
   * another tenant's ticket, so read through the cross-tenant ones. Workflow actions (assign,
   * resolve, comment) are tenant-scoped on the API, so this view is read-only.
   */
  crossTenant: boolean
  /** Called after any successful mutation so a surrounding list can refresh its row. */
  onChanged?: () => void
}

/** All data + workflow logic for one ticket (moved verbatim from the former detail page). */
export function useTicketDetail({ ticketId, crossTenant, onChanged }: UseTicketDetailOptions) {
  const { toast } = useToast()

  const [ticket, setTicket] = useState<DotnetTicketDto | null>(null)
  const [comments, setComments] = useState<DotnetTicketCommentDto[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const [commentBody, setCommentBody] = useState("")
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [actionPending, setActionPending] = useState<TicketAction | null>(null)
  const [assigneeSelection, setAssigneeSelection] = useState<string>(NO_ASSIGNEE)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setPermissionDenied(false)
    try {
      const [ticketDto, commentList] = crossTenant
        ? await Promise.all([getTicketAcrossTenants(ticketId), listTicketCommentsAcrossTenants(ticketId)])
        : await Promise.all([getTicket(ticketId), listTicketComments(ticketId)])
      setTicket(ticketDto)
      setComments(commentList)
      setAssigneeSelection(ticketDto.assignedToUserId ?? NO_ASSIGNEE)
    } catch (error) {
      const message = ticketErrorMessage(error, "We couldn't load this ticket")
      if (isPermissionErrorMessage(message)) {
        setPermissionDenied(true)
      }
      setLoadError(message)
    } finally {
      setIsLoading(false)
    }
  }, [ticketId, crossTenant])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    loadDotnetCurrentUser()
      .then((current) => {
        setPermissions(current?.info.permissions ?? [])
        setCurrentUserId(current?.id ?? null)
      })
      .catch(() => {
        setPermissions([])
      })
  }, [])

  // Only fetch the tenant's user list when the signed-in user can actually assign tickets —
  // avoids an extra privileged call for everyone else.
  useEffect(() => {
    if (crossTenant || !canAssignTickets(permissions)) return
    usersApi.getUsers({ limit: 200 }).then((res) => {
      if (!res.error) setUsers(res.data)
    })
  }, [permissions, crossTenant])

  const userLabel = useCallback(
    (userId: string | null | undefined): string => {
      if (!userId) return "Unassigned"
      const user = users.find((u) => u.id === userId)
      if (user) return user.full_name || user.email
      if (userId === currentUserId) return "You"
      return `User ${userId.slice(0, 8)}`
    },
    [users, currentUserId],
  )

  const refreshAfterAction = async () => {
    await load()
    onChanged?.()
  }

  const handleAddComment = async () => {
    if (!commentBody.trim()) return
    setCommentSubmitting(true)
    try {
      await addTicketComment(ticketId, commentBody)
      setCommentBody("")
      const commentList = crossTenant ? await listTicketCommentsAcrossTenants(ticketId) : await listTicketComments(ticketId)
      setComments(commentList)
      toast({ title: "Comment added" })
      onChanged?.()
    } catch (error) {
      toast({ title: "Couldn't add comment", description: ticketErrorMessage(error), variant: "destructive" })
    } finally {
      setCommentSubmitting(false)
    }
  }

  const handleAssign = async (value: string) => {
    setAssigneeSelection(value)
    setActionPending("assign")
    try {
      await assignTicket(ticketId, value === NO_ASSIGNEE ? null : value)
      toast({ title: value === NO_ASSIGNEE ? "Ticket unassigned" : "Ticket assigned" })
      await refreshAfterAction()
    } catch (error) {
      toast({ title: "Couldn't update assignment", description: ticketErrorMessage(error), variant: "destructive" })
      setAssigneeSelection(ticket?.assignedToUserId ?? NO_ASSIGNEE)
    } finally {
      setActionPending(null)
    }
  }

  const handleResolve = async () => {
    setActionPending("resolve")
    try {
      await resolveTicket(ticketId)
      toast({ title: "Ticket resolved" })
      await refreshAfterAction()
    } catch (error) {
      toast({ title: "Couldn't resolve ticket", description: ticketErrorMessage(error), variant: "destructive" })
    } finally {
      setActionPending(null)
    }
  }

  const handleReopen = async () => {
    setActionPending("reopen")
    try {
      await reopenTicket(ticketId)
      toast({ title: "Ticket reopened" })
      await refreshAfterAction()
    } catch (error) {
      toast({ title: "Couldn't reopen ticket", description: ticketErrorMessage(error), variant: "destructive" })
    } finally {
      setActionPending(null)
    }
  }

  const handleClose = async () => {
    setActionPending("close")
    try {
      await closeTicket(ticketId)
      toast({ title: "Ticket closed" })
      await refreshAfterAction()
    } catch (error) {
      toast({ title: "Couldn't close ticket", description: ticketErrorMessage(error), variant: "destructive" })
    } finally {
      setActionPending(null)
    }
  }

  const status = ticket ? (ticket.status as TicketStatus) : null
  // Reporters act on their own ticket; admins (Tickets.ViewAll + the action permission) on any.
  const { isReporter, canAssign, canResolve, canReopen, canClose, canComment } = ticketActionAccess({
    permissions,
    currentUserId,
    reporterUserId: ticket?.reporterUserId,
    status,
    crossTenant,
  })

  return {
    ticket,
    status,
    comments,
    users,
    isLoading,
    loadError,
    permissionDenied,
    reload: load,
    userLabel,
    commentBody,
    setCommentBody,
    commentSubmitting,
    actionPending,
    assigneeSelection,
    handleAddComment,
    handleAssign,
    handleResolve,
    handleReopen,
    handleClose,
    isReporter,
    canAssign,
    canResolve,
    canReopen,
    canClose,
    canComment,
  }
}

export type TicketDetailState = ReturnType<typeof useTicketDetail>
