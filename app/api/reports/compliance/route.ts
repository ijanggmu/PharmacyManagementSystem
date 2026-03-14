/**
 * Compliance Reporting API
 * Generates reports for DEA, State Board, and regulatory compliance
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  // Permission check - restrict compliance reports to users with reports:read
  const permResult = await requirePermission(request, "reports:read")
  if (permResult instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return permResult
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get("type") || "dea"
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    let reportData: any = {}

    switch (reportType) {
      case "dea":
        // DEA Controlled Substance Report
        reportData = await generateDEAReport(supabase, authResult.user.tenantId, startDate, endDate)
        break
      case "state-board":
        // State Board of Pharmacy Report
        reportData = await generateStateBoardReport(supabase, authResult.user.tenantId, startDate, endDate)
        break
      case "pmp":
        // Prescription Drug Monitoring Program Report
        reportData = await generatePMPReport(supabase, authResult.user.tenantId, startDate, endDate)
        break
      case "inventory":
        // Inventory Discrepancy Report
        reportData = await generateInventoryDiscrepancyReport(supabase, authResult.user.tenantId, startDate, endDate)
        break
      case "audit":
        // Audit Trail Report
        reportData = await generateAuditTrailReport(supabase, startDate, endDate)
        break
      default:
        return Errors.VALIDATION_ERROR({ reportType: "Invalid report type. Must be one of: dea, state-board, pmp, inventory, audit" })
    }

    logRequest(request, { 
      status: 200, 
      duration: Date.now() - startTime,
      userId: authResult.user.id 
    })

    return successResponse({
      ...reportData,
      meta: {
        reportType,
        generatedAt: new Date().toISOString(),
        generatedBy: authResult.user.id,
      }
    })
  } catch (error: any) {
    logRequest(request, { 
      status: 500, 
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error.message 
    })
    return errorResponse("INTERNAL_ERROR", error.message || "Failed to generate compliance report")
  }
}

/**
 * Generate DEA Controlled Substance Report
 */
async function generateDEAReport(
  supabase: any,
  tenantId: string | undefined,
  startDate: string | null,
  endDate: string | null,
) {
  const query = supabase
    .from("prescriptions")
    .select(`
      *,
      customers (id, first_name, last_name, date_of_birth),
      prescription_items (
        quantity_prescribed,
        quantity_dispensed,
        medicines (
          id,
          name,
          generic_name,
          controlled_substance,
          controlled_substance_schedule
        )
      )
    `)
    .eq("prescription_items.medicines.controlled_substance", true)

  if (tenantId) {
    query.eq("tenant_id", tenantId)
  }

  if (startDate) {
    query.gte("issue_date", startDate)
  }
  if (endDate) {
    query.lte("issue_date", endDate)
  }

  const { data: prescriptions, error } = await query.order("issue_date", { ascending: false })

  if (error) throw error

  // Group by schedule
  const bySchedule: Record<string, any[]> = {
    I: [],
    II: [],
    III: [],
    IV: [],
    V: [],
  }

  prescriptions?.forEach((prescription: any) => {
    prescription.prescription_items?.forEach((item: any) => {
      if (item.medicines?.controlled_substance) {
        const schedule = item.medicines.controlled_substance_schedule || "Unknown"
        if (bySchedule[schedule]) {
          bySchedule[schedule].push({
            prescription_number: prescription.prescription_number,
            issue_date: prescription.issue_date,
            doctor_name: prescription.doctor_name,
            doctor_dea_number: prescription.doctor_dea_number,
            customer: prescription.customers,
            medicine: item.medicines,
            quantity_prescribed: item.quantity_prescribed,
            quantity_dispensed: item.quantity_dispensed,
          })
        }
      }
    })
  })

  return {
    reportType: "DEA Controlled Substance Report",
    period: { startDate, endDate },
    summary: {
      totalPrescriptions: prescriptions?.length || 0,
      bySchedule: Object.keys(bySchedule).reduce((acc, schedule) => {
        acc[schedule] = bySchedule[schedule].length
        return acc
      }, {} as Record<string, number>),
    },
    details: bySchedule,
  }
}

/**
 * Generate State Board of Pharmacy Report
 */
async function generateStateBoardReport(
  supabase: any,
  tenantId: string | undefined,
  startDate: string | null,
  endDate: string | null,
) {
  const query = supabase
    .from("prescriptions")
    .select(`
      *,
      customers (id, first_name, last_name, phone, email),
      prescription_items (
        quantity_prescribed,
        quantity_dispensed,
        medicines (name, generic_name)
      )
    `)

  if (tenantId) {
    query.eq("tenant_id", tenantId)
  }

  if (startDate) {
    query.gte("issue_date", startDate)
  }
  if (endDate) {
    query.lte("issue_date", endDate)
  }

  const { data: prescriptions, error } = await query.order("issue_date", { ascending: false })

  if (error) throw error

  return {
    reportType: "State Board of Pharmacy Report",
    period: { startDate, endDate },
    summary: {
      totalPrescriptions: prescriptions?.length || 0,
      filled: prescriptions?.filter((p: any) => p.status === "filled").length || 0,
      pending: prescriptions?.filter((p: any) => p.status === "pending").length || 0,
      cancelled: prescriptions?.filter((p: any) => p.status === "cancelled").length || 0,
    },
    prescriptions: prescriptions?.map((p: any) => ({
      prescription_number: p.prescription_number,
      issue_date: p.issue_date,
      expiry_date: p.expiry_date,
      doctor_name: p.doctor_name,
      doctor_license: p.doctor_license,
      doctor_dea_number: p.doctor_dea_number,
      customer: p.customers,
      status: p.status,
      items: p.prescription_items,
    })) || [],
  }
}

/**
 * Generate Prescription Drug Monitoring Program (PDMP) Report
 */
async function generatePMPReport(
  supabase: any,
  tenantId: string | undefined,
  startDate: string | null,
  endDate: string | null,
) {
  const query = supabase
    .from("prescriptions")
    .select(`
      *,
      customers (id, first_name, last_name, date_of_birth, address),
      prescription_items (
        quantity_prescribed,
        quantity_dispensed,
        medicines (
          name,
          generic_name,
          controlled_substance,
          controlled_substance_schedule
        )
      )
    `)
    .eq("prescription_items.medicines.controlled_substance", true)

  if (tenantId) {
    query.eq("tenant_id", tenantId)
  }

  if (startDate) {
    query.gte("issue_date", startDate)
  }
  if (endDate) {
    query.lte("issue_date", endDate)
  }

  const { data: prescriptions, error } = await query.order("issue_date", { ascending: false })

  if (error) throw error

  return {
    reportType: "Prescription Drug Monitoring Program (PDMP) Report",
    period: { startDate, endDate },
    summary: {
      totalControlledSubstancePrescriptions: prescriptions?.length || 0,
    },
    prescriptions: prescriptions?.map((p: any) => ({
      prescription_number: p.prescription_number,
      issue_date: p.issue_date,
      doctor_name: p.doctor_name,
      doctor_dea_number: p.doctor_dea_number,
      customer: {
        name: `${p.customers?.first_name} ${p.customers?.last_name}`,
        date_of_birth: p.customers?.date_of_birth,
        address: p.customers?.address,
      },
      controlledSubstances: p.prescription_items
        ?.filter((item: any) => item.medicines?.controlled_substance)
        .map((item: any) => ({
          medicine: item.medicines.name,
          schedule: item.medicines.controlled_substance_schedule,
          quantity: item.quantity_dispensed || item.quantity_prescribed,
        })) || [],
    })) || [],
  }
}

/**
 * Generate Inventory Discrepancy Report
 */
async function generateInventoryDiscrepancyReport(
  supabase: any,
  tenantId: string | undefined,
  startDate: string | null,
  endDate: string | null,
) {
  // Get inventory adjustments and discrepancies
  const { data: medicines, error } = await supabase
    .from("medicines")
    .select("id, name, stock_quantity, minimum_stock, maximum_stock")
    .eq("tenant_id", tenantId)
    .order("name")

  if (error) throw error

  const discrepancies = medicines?.filter((m: any) => {
    const stock = m.stock_quantity || 0
    const min = m.minimum_stock || 0
    const max = m.maximum_stock || 0

    // Low stock
    if (stock < min) return true
    // Overstock
    if (max > 0 && stock > max) return true
    return false
  }) || []

  return {
    reportType: "Inventory Discrepancy Report",
    period: { startDate, endDate },
    summary: {
      totalMedicines: medicines?.length || 0,
      discrepancies: discrepancies.length,
      lowStock: discrepancies.filter((m: any) => (m.stock_quantity || 0) < (m.minimum_stock || 0)).length,
      overstock: discrepancies.filter((m: any) => {
        const max = m.maximum_stock || 0
        return max > 0 && (m.stock_quantity || 0) > max
      }).length,
    },
    discrepancies: discrepancies.map((m: any) => ({
      medicine: m.name,
      currentStock: m.stock_quantity,
      minimumStock: m.minimum_stock,
      maximumStock: m.maximum_stock,
      status: (m.stock_quantity || 0) < (m.minimum_stock || 0) ? "low" : "overstock",
    })),
  }
}

/**
 * Generate Audit Trail Report
 */
async function generateAuditTrailReport(supabase: any, startDate: string | null, endDate: string | null) {
  const query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000)

  if (startDate) {
    query.gte("created_at", startDate)
  }
  if (endDate) {
    query.lte("created_at", endDate)
  }

  const { data: auditLogs, error } = await query

  // If audit_logs table doesn't exist yet, return an empty report instead of failing
  if (error) {
    if (
      typeof error.message === "string" &&
      (error.message.includes("audit_logs") || error.message.includes("schema cache"))
    ) {
      return {
        reportType: "Audit Trail Report",
        period: { startDate, endDate },
        summary: {
          totalLogs: 0,
          byAction: {},
          phiAccessCount: 0,
        },
        logs: [],
      }
    }
    throw error
  }

  // Group by action type
  const byAction: Record<string, number> = {}
    const phiAccess: number = 0 // PHI tracking removed

  auditLogs?.forEach((log: any) => {
    byAction[log.action] = (byAction[log.action] || 0) + 1
  })

  return {
    reportType: "Audit Trail Report",
    period: { startDate, endDate },
    summary: {
      totalLogs: auditLogs?.length || 0,
      byAction,
      phiAccessCount: phiAccess,
    },
    logs: auditLogs?.slice(0, 100) || [], // Limit to 100 most recent
  }
}

