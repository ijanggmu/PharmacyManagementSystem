/**
 * Audit Logging Middleware
 * Tracks all system changes for compliance and security
 */

import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"

export interface AuditLogData {
  table_name: string
  record_id: string
  action: "INSERT" | "UPDATE" | "DELETE" | "SELECT" | "ACCESS"
  old_data?: any
  new_data?: any
  ip_address?: string
  user_agent?: string
  access_type?: "read" | "write" | "delete"
}

export async function createAuditLog(data: AuditLogData) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Determine access type
    const accessType = data.action === "SELECT" || data.action === "ACCESS" 
      ? "read" 
      : data.action === "DELETE" 
      ? "delete" 
      : "write"

    await supabase.from("audit_logs").insert({
      user_id: user?.id || null,
      table_name: data.table_name,
      record_id: data.record_id,
      action: data.action,
      old_data: data.old_data ? JSON.stringify(data.old_data) : null,
      new_data: data.new_data ? JSON.stringify(data.new_data) : null,
      ip_address: data.ip_address,
      user_agent: data.user_agent,
      access_type: data.access_type || accessType,
    })
  } catch (error) {
    // Don't throw - audit logging should not break the application
    console.error("Failed to create audit log:", error)
  }
}

export async function getAuditLogs(filters: {
  table_name?: string
  record_id?: string
  user_id?: string
  action?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
  access_type?: "read" | "write" | "delete"
}) {
  try {
    const supabase = await createClient()
    let query = supabase.from("audit_logs").select("*", { count: "exact" })

    if (filters.table_name) {
      query = query.eq("table_name", filters.table_name)
    }

    if (filters.record_id) {
      query = query.eq("record_id", filters.record_id)
    }

    if (filters.user_id) {
      query = query.eq("user_id", filters.user_id)
    }

    if (filters.action) {
      query = query.eq("action", filters.action)
    }

    if (filters.date_from) {
      query = query.gte("created_at", filters.date_from)
    }

    if (filters.date_to) {
      query = query.lte("created_at", filters.date_to)
    }

    if (filters.access_type) {
      query = query.eq("access_type", filters.access_type)
    }

    query = query.order("created_at", { ascending: false })

    if (filters.limit) {
      const offset = filters.offset || 0
      query = query.range(offset, offset + filters.limit - 1)
    }

    const { data, error, count } = await query

    if (error) {
      throw error
    }

    return { data, count }
  } catch (error) {
    console.error("Failed to get audit logs:", error)
    throw error
  }
}
