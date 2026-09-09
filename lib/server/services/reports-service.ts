/**
 * Server-only reporting/compliance persistence. Used by `app/api/reports/*`
 * and `app/api/ird/*` Route Handlers.
 *
 * Keeps Supabase queries and aggregation out of Route Handlers so the same
 * logic is portable to another transport later.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchBatchAggMap, effectiveExpiryFromAgg } from "@/lib/server/services/medicine-service"

// ---------------------------------------------------------------------------
// Compliance reports (DEA / State Board / PMP / Inventory discrepancy / Audit)
// ---------------------------------------------------------------------------

interface ComplianceMedicineEmbed {
  id?: string
  name?: string | null
  generic_name?: string | null
  controlled_substance?: boolean | null
  controlled_substance_schedule?: string | null
}

interface CompliancePrescriptionItemEmbed {
  quantity_prescribed?: number | null
  quantity_dispensed?: number | null
  medicines?: ComplianceMedicineEmbed | null
}

interface ComplianceCustomerEmbed {
  id?: string
  first_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

interface CompliancePrescriptionRow {
  prescription_number?: string | null
  issue_date?: string | null
  expiry_date?: string | null
  doctor_name?: string | null
  doctor_license?: string | null
  doctor_dea_number?: string | null
  status?: string | null
  customers?: ComplianceCustomerEmbed | null
  prescription_items?: CompliancePrescriptionItemEmbed[] | null
}

export interface DeaComplianceReportEntry {
  prescription_number?: string | null
  issue_date?: string | null
  doctor_name?: string | null
  doctor_dea_number?: string | null
  customer?: ComplianceCustomerEmbed | null
  medicine?: ComplianceMedicineEmbed | null
  quantity_prescribed?: number | null
  quantity_dispensed?: number | null
}

export interface DeaComplianceReport {
  reportType: string
  period: { startDate: string | null; endDate: string | null }
  summary: {
    totalPrescriptions: number
    bySchedule: Record<string, number>
  }
  details: Record<string, DeaComplianceReportEntry[]>
}

/** Generate DEA Controlled Substance Report */
export async function generateDeaComplianceReport(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  startDate: string | null,
  endDate: string | null
): Promise<DeaComplianceReport> {
  const query = supabase
    .from("prescriptions")
    .select(
      `
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
    `
    )
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

  const { data, error } = await query.order("issue_date", { ascending: false })

  if (error) throw error

  const prescriptions = (data || []) as CompliancePrescriptionRow[]

  const bySchedule: Record<string, DeaComplianceReportEntry[]> = {
    I: [],
    II: [],
    III: [],
    IV: [],
    V: [],
  }

  prescriptions.forEach((prescription) => {
    prescription.prescription_items?.forEach((item) => {
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
      totalPrescriptions: prescriptions.length,
      bySchedule: Object.keys(bySchedule).reduce((acc, schedule) => {
        acc[schedule] = bySchedule[schedule].length
        return acc
      }, {} as Record<string, number>),
    },
    details: bySchedule,
  }
}

export interface StateBoardComplianceReportEntry {
  prescription_number?: string | null
  issue_date?: string | null
  expiry_date?: string | null
  doctor_name?: string | null
  doctor_license?: string | null
  doctor_dea_number?: string | null
  customer?: ComplianceCustomerEmbed | null
  status?: string | null
  items?: CompliancePrescriptionItemEmbed[] | null
}

export interface StateBoardComplianceReport {
  reportType: string
  period: { startDate: string | null; endDate: string | null }
  summary: {
    totalPrescriptions: number
    filled: number
    pending: number
    cancelled: number
  }
  prescriptions: StateBoardComplianceReportEntry[]
}

/** Generate State Board of Pharmacy Report */
export async function generateStateBoardComplianceReport(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  startDate: string | null,
  endDate: string | null
): Promise<StateBoardComplianceReport> {
  const query = supabase
    .from("prescriptions")
    .select(
      `
      *,
      customers (id, first_name, last_name, phone, email),
      prescription_items (
        quantity_prescribed,
        quantity_dispensed,
        medicines (name, generic_name)
      )
    `
    )

  if (tenantId) {
    query.eq("tenant_id", tenantId)
  }

  if (startDate) {
    query.gte("issue_date", startDate)
  }
  if (endDate) {
    query.lte("issue_date", endDate)
  }

  const { data, error } = await query.order("issue_date", { ascending: false })

  if (error) throw error

  const prescriptions = (data || []) as CompliancePrescriptionRow[]

  return {
    reportType: "State Board of Pharmacy Report",
    period: { startDate, endDate },
    summary: {
      totalPrescriptions: prescriptions.length,
      filled: prescriptions.filter((p) => p.status === "filled").length,
      pending: prescriptions.filter((p) => p.status === "pending").length,
      cancelled: prescriptions.filter((p) => p.status === "cancelled").length,
    },
    prescriptions: prescriptions.map((p) => ({
      prescription_number: p.prescription_number,
      issue_date: p.issue_date,
      expiry_date: p.expiry_date,
      doctor_name: p.doctor_name,
      doctor_license: p.doctor_license,
      doctor_dea_number: p.doctor_dea_number,
      customer: p.customers,
      status: p.status,
      items: p.prescription_items,
    })),
  }
}

export interface PmpComplianceReportEntry {
  prescription_number?: string | null
  issue_date?: string | null
  doctor_name?: string | null
  doctor_dea_number?: string | null
  customer: {
    name: string
    date_of_birth?: string | null
    address?: string | null
  }
  controlledSubstances: Array<{
    medicine?: string | null
    schedule?: string | null
    quantity?: number | null
  }>
}

export interface PmpComplianceReport {
  reportType: string
  period: { startDate: string | null; endDate: string | null }
  summary: { totalControlledSubstancePrescriptions: number }
  prescriptions: PmpComplianceReportEntry[]
}

/** Generate Prescription Drug Monitoring Program (PDMP) Report */
export async function generatePmpComplianceReport(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  startDate: string | null,
  endDate: string | null
): Promise<PmpComplianceReport> {
  const query = supabase
    .from("prescriptions")
    .select(
      `
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
    `
    )
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

  const { data, error } = await query.order("issue_date", { ascending: false })

  if (error) throw error

  const prescriptions = (data || []) as CompliancePrescriptionRow[]

  return {
    reportType: "Prescription Drug Monitoring Program (PDMP) Report",
    period: { startDate, endDate },
    summary: {
      totalControlledSubstancePrescriptions: prescriptions.length,
    },
    prescriptions: prescriptions.map((p) => ({
      prescription_number: p.prescription_number,
      issue_date: p.issue_date,
      doctor_name: p.doctor_name,
      doctor_dea_number: p.doctor_dea_number,
      customer: {
        name: `${p.customers?.first_name} ${p.customers?.last_name}`,
        date_of_birth: p.customers?.date_of_birth,
        address: p.customers?.address,
      },
      controlledSubstances:
        p.prescription_items
          ?.filter((item) => item.medicines?.controlled_substance)
          .map((item) => ({
            medicine: item.medicines?.name,
            schedule: item.medicines?.controlled_substance_schedule,
            quantity: item.quantity_dispensed || item.quantity_prescribed,
          })) || [],
    })),
  }
}

interface ComplianceMedicineStockRow {
  id?: string
  name?: string | null
  stock_quantity?: number | null
  minimum_stock?: number | null
  maximum_stock?: number | null
}

export interface InventoryDiscrepancyReportEntry {
  medicine?: string | null
  currentStock?: number | null
  minimumStock?: number | null
  maximumStock?: number | null
  status: "low" | "overstock"
}

export interface InventoryDiscrepancyReport {
  reportType: string
  period: { startDate: string | null; endDate: string | null }
  summary: {
    totalMedicines: number
    discrepancies: number
    lowStock: number
    overstock: number
  }
  discrepancies: InventoryDiscrepancyReportEntry[]
}

/** Generate Inventory Discrepancy Report */
export async function generateInventoryDiscrepancyComplianceReport(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  startDate: string | null,
  endDate: string | null
): Promise<InventoryDiscrepancyReport> {
  const { data, error } = await supabase
    .from("medicines")
    .select("id, name, stock_quantity, minimum_stock, maximum_stock")
    .eq("tenant_id", tenantId)
    .order("name")

  if (error) throw error

  const medicines = (data || []) as ComplianceMedicineStockRow[]

  const discrepancies = medicines.filter((m) => {
    const stock = m.stock_quantity || 0
    const min = m.minimum_stock || 0
    const max = m.maximum_stock || 0

    // Low stock
    if (stock < min) return true
    // Overstock
    if (max > 0 && stock > max) return true
    return false
  })

  return {
    reportType: "Inventory Discrepancy Report",
    period: { startDate, endDate },
    summary: {
      totalMedicines: medicines.length,
      discrepancies: discrepancies.length,
      lowStock: discrepancies.filter((m) => (m.stock_quantity || 0) < (m.minimum_stock || 0)).length,
      overstock: discrepancies.filter((m) => {
        const max = m.maximum_stock || 0
        return max > 0 && (m.stock_quantity || 0) > max
      }).length,
    },
    discrepancies: discrepancies.map((m) => ({
      medicine: m.name,
      currentStock: m.stock_quantity,
      minimumStock: m.minimum_stock,
      maximumStock: m.maximum_stock,
      status: (m.stock_quantity || 0) < (m.minimum_stock || 0) ? "low" : "overstock",
    })),
  }
}

interface ComplianceAuditLogRow {
  action: string
  created_at?: string | null
  [key: string]: unknown
}

export interface AuditTrailComplianceReport {
  reportType: string
  period: { startDate: string | null; endDate: string | null }
  summary: {
    totalLogs: number
    byAction: Record<string, number>
    phiAccessCount: number
  }
  logs: ComplianceAuditLogRow[]
}

/** Generate Audit Trail Report */
export async function generateAuditTrailComplianceReport(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  startDate: string | null,
  endDate: string | null
): Promise<AuditTrailComplianceReport> {
  if (!tenantId) {
    return {
      reportType: "Audit Trail Report",
      period: { startDate, endDate },
      summary: { totalLogs: 0, byAction: {}, phiAccessCount: 0 },
      logs: [],
    }
  }

  const query = supabase
    .from("audit_logs")
    .select("*")
    .eq("tenant_id", tenantId)
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

  const logs = (auditLogs || []) as ComplianceAuditLogRow[]

  // Group by action type
  const byAction: Record<string, number> = {}
  const phiAccess = 0 // PHI tracking removed

  logs.forEach((log) => {
    byAction[log.action] = (byAction[log.action] || 0) + 1
  })

  return {
    reportType: "Audit Trail Report",
    period: { startDate, endDate },
    summary: {
      totalLogs: logs.length,
      byAction,
      phiAccessCount: phiAccess,
    },
    logs: logs.slice(0, 100), // Limit to 100 most recent
  }
}

// ---------------------------------------------------------------------------
// IRD invoice enqueue (app/api/ird)
// ---------------------------------------------------------------------------

interface IrdSaleMedicineEmbed {
  id?: string
  name?: string | null
  generic_name?: string | null
  is_taxable?: boolean | null
}

interface IrdSaleItemEmbed {
  id?: string
  quantity?: number | null
  unit_price?: number | null
  total_price?: number | null
  medicines?: IrdSaleMedicineEmbed | null
}

interface IrdSaleCustomerEmbed {
  id?: string
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
}

interface IrdSaleRow {
  id: string
  invoice_number?: string | null
  sale_date?: string | null
  total_amount?: number | null
  tax_amount?: number | null
  discount_amount?: number | null
  customers?: IrdSaleCustomerEmbed | null
  sale_items?: IrdSaleItemEmbed[] | null
}

export type EnqueueIrdInvoiceResult =
  | { status: "not_found" }
  | { status: "queue_failed"; message: string }
  | { status: "ok"; saleId: string; invoiceNumber: string }

/**
 * Loads a sale, assigns/locks an invoice number if missing, builds the IRD
 * payload, and enqueues it into `ird_invoice_queue`.
 */
export async function enqueueIrdInvoice(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  userId: string,
  saleId: string
): Promise<EnqueueIrdInvoiceResult> {
  // Load sale for this tenant
  const { data: saleData, error: saleError } = await supabase
    .from("sales")
    .select(
      `
      *,
      customers (id, first_name, last_name, phone),
      sale_items (
        id,
        quantity,
        unit_price,
        total_price,
        medicines (id, name, generic_name, is_taxable)
      )
    `
    )
    .eq("id", saleId)
    .eq("tenant_id", tenantId)
    .single()

  if (saleError || !saleData) {
    return { status: "not_found" }
  }

  const sale = saleData as IrdSaleRow

  // Generate invoice number if missing (simple per-tenant pattern; can be replaced with IRD-specific sequencing)
  let invoiceNumber = sale.invoice_number
  if (!invoiceNumber) {
    const today = new Date()
    const y = today.getFullYear().toString().slice(-2)
    const m = String(today.getMonth() + 1).padStart(2, "0")
    const d = String(today.getDate()).padStart(2, "0")
    invoiceNumber = `INV-${y}${m}${d}-${Math.floor(Math.random() * 9000 + 1000)}`

    // Lock sale once it has an invoice number and is enqueued for IRD
    await supabase
      .from("sales")
      .update({
        invoice_number: invoiceNumber,
        locked_at: new Date().toISOString(),
        locked_by: userId,
      })
      .eq("id", sale.id)
      .eq("tenant_id", tenantId)
  }

  // Build minimal IRD payload
  const payload = {
    invoiceNumber,
    saleDate: sale.sale_date,
    totalAmount: sale.total_amount,
    taxAmount: sale.tax_amount,
    discountAmount: sale.discount_amount,
    customer: sale.customers
      ? {
          id: sale.customers.id,
          name: `${sale.customers.first_name} ${sale.customers.last_name}`,
          phone: sale.customers.phone,
        }
      : null,
    items:
      sale.sale_items?.map((item) => ({
        name: item.medicines?.name,
        genericName: item.medicines?.generic_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        isTaxable: item.medicines?.is_taxable ?? true,
      })) ?? [],
  }

  // Enqueue for IRD sync
  const { error: queueError } = await supabase.from("ird_invoice_queue").insert({
    tenant_id: tenantId,
    sale_id: sale.id,
    payload,
    status: "pending",
    attempts: 0,
  })

  if (queueError) {
    return { status: "queue_failed", message: queueError.message }
  }

  return { status: "ok", saleId: sale.id, invoiceNumber }
}

// ---------------------------------------------------------------------------
// IRD compliance registers (app/api/reports/ird)
// ---------------------------------------------------------------------------

type IrdReportCustomerEmbed = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
} | null

type IrdSalesRegisterDbRow = {
  id: string
  sale_number: string | null
  invoice_number: string | null
  sale_date: string
  total_amount: number | null
  tax_amount: number | null
  discount_amount: number | null
  payment_method: string | null
  ird_status: string | null
  customer_id: string | null
  customers: IrdReportCustomerEmbed
}

type IrdAnnex13DbRow = Omit<IrdSalesRegisterDbRow, "id">

type IrdGoodsReceiptEmbed = {
  supplier_invoice_number?: string | null
  receipt_number?: string | null
}

type IrdPurchaseRegisterDbRow = {
  id: string
  order_number: string | null
  order_date: string
  status: string | null
  total_amount: number | null
  suppliers: { name?: string | null } | null
  goods_receipts: IrdGoodsReceiptEmbed[] | null
}

function aggregateSupplierBills(receipts: IrdGoodsReceiptEmbed[] | null | undefined): string {
  if (!receipts?.length) return ""
  const set = new Set<string>()
  for (const r of receipts) {
    const v = r.supplier_invoice_number?.trim()
    if (v) set.add(v)
  }
  return [...set].join("; ")
}

export type IrdReportType = "sales-register" | "purchase-register" | "annex-13" | "annex-14"

/**
 * Builds the row set for `/api/reports/ird` (`sales-register`, `purchase-register`,
 * `annex-13`, `annex-14`). Throws on Supabase errors (caller wraps in try/catch).
 */
export async function getIrdReportRows(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  type: IrdReportType,
  periodStart: string,
  periodEnd: string
): Promise<Record<string, unknown>[]> {
  if (type === "sales-register") {
    const { data: sales, error } = await supabase
      .from("sales")
      .select(
        `
        id,
        sale_number,
        invoice_number,
        sale_date,
        total_amount,
        tax_amount,
        discount_amount,
        payment_method,
        ird_status,
        customer_id,
        customers (first_name, last_name, phone, email)
      `
      )
      .eq("tenant_id", tenantId)
      .gte("sale_date", periodStart)
      .lte("sale_date", periodEnd)
      .order("sale_date", { ascending: true })

    if (error) throw error
    return ((sales || []) as IrdSalesRegisterDbRow[]).map((s) => {
      const c = s.customers
      const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() : ""
      return {
        id: s.id,
        sale_number: s.sale_number,
        invoice_number: s.invoice_number ?? "",
        sale_date: s.sale_date,
        total_amount: s.total_amount,
        tax_amount: s.tax_amount,
        discount_amount: s.discount_amount,
        payment_method: s.payment_method,
        ird_status: s.ird_status,
        customer_id: s.customer_id,
        customer_name: name || (s.customer_id ? "—" : "Walk-in"),
        customer_phone: c?.phone ?? "",
        customer_email: c?.email ?? "",
      }
    })
  }

  if (type === "purchase-register") {
    const { data: purchases, error } = await supabase
      .from("purchase_orders")
      .select(
        `
        id,
        order_number,
        order_date,
        status,
        total_amount,
        suppliers (name),
        goods_receipts (supplier_invoice_number, receipt_number)
      `
      )
      .eq("tenant_id", tenantId)
      .gte("order_date", periodStart)
      .lte("order_date", periodEnd)
      .order("order_date", { ascending: true })

    if (error) throw error
    return (
      ((purchases || []) as IrdPurchaseRegisterDbRow[]).map((p) => ({
        id: p.id,
        order_number: p.order_number,
        order_date: p.order_date,
        status: p.status,
        total_amount: p.total_amount,
        supplier_name: p.suppliers?.name ?? "",
        supplier_tax_invoice_numbers: aggregateSupplierBills(p.goods_receipts),
      })) ?? []
    )
  }

  if (type === "annex-13") {
    const { data: sales, error } = await supabase
      .from("sales")
      .select(
        `
        sale_number,
        invoice_number,
        sale_date,
        total_amount,
        tax_amount,
        discount_amount,
        payment_method,
        ird_status,
        customer_id,
        customers (first_name, last_name, phone)
      `
      )
      .eq("tenant_id", tenantId)
      .gte("sale_date", periodStart)
      .lte("sale_date", periodEnd)
      .order("sale_date", { ascending: true })

    if (error) throw error

    return (
      ((sales || []) as IrdAnnex13DbRow[]).map((s) => {
        const c = s.customers
        const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() : ""
        return {
          sale_date: s.sale_date,
          sale_number: s.sale_number,
          invoice_number: s.invoice_number ?? "",
          customer_name: name || (s.customer_id ? "—" : "Walk-in"),
          customer_phone: c?.phone ?? "",
          taxable_amount: Number(s.total_amount ?? 0) - Number(s.tax_amount ?? 0),
          tax_amount: s.tax_amount ?? 0,
          discount_amount: s.discount_amount ?? 0,
          total_amount: s.total_amount ?? 0,
          payment_method: s.payment_method ?? "",
          ird_status: s.ird_status ?? "",
        }
      }) ?? []
    )
  }

  // annex-14
  const { data: purchases, error } = await supabase
    .from("purchase_orders")
    .select(
      `
      order_number,
      order_date,
      status,
      total_amount,
      suppliers (name),
      goods_receipts (supplier_invoice_number, receipt_number)
    `
    )
    .eq("tenant_id", tenantId)
    .gte("order_date", periodStart)
    .lte("order_date", periodEnd)
    .order("order_date", { ascending: true })

  if (error) throw error

  return (
    ((purchases || []) as Omit<IrdPurchaseRegisterDbRow, "id">[]).map((p) => ({
      order_date: p.order_date,
      purchase_number: p.order_number,
      supplier_name: p.suppliers?.name ?? "",
      supplier_tax_invoice_numbers: aggregateSupplierBills(p.goods_receipts),
      total_amount: p.total_amount ?? 0,
      status: p.status ?? "",
    })) ?? []
  )
}

// ---------------------------------------------------------------------------
// DDA Narcotic Register
// ---------------------------------------------------------------------------

export interface DdaNarcoticRegisterFilters {
  periodStart: string
  periodEnd: string
  medicineName?: string | null
  doctorName?: string | null
  schedule?: string | null
}

export interface DdaNarcoticRegisterRow {
  tenant_id?: string
  sale_id?: string
  sale_number?: string | null
  invoice_number?: string | null
  sale_date?: string | null
  customer_id?: string | null
  first_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null
  prescription_id?: string | null
  prescription_number?: string | null
  doctor_name?: string | null
  doctor_license?: string | null
  sale_item_id?: string | null
  medicine_id?: string | null
  medicine_name?: string | null
  generic_name?: string | null
  strength?: string | null
  form?: string | null
  controlled_substance?: boolean | null
  quantity?: number | null
  unit_price?: number | null
  line_total?: number | null
}

/**
 * Backed by the `dda_narcotic_register` view. Throws on Supabase errors
 * (caller wraps in try/catch).
 */
export async function getDdaNarcoticRegister(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  filters: DdaNarcoticRegisterFilters
): Promise<DdaNarcoticRegisterRow[]> {
  let query = supabase
    .from("dda_narcotic_register")
    .select(
      `
      tenant_id,
      sale_id,
      sale_number,
      invoice_number,
      sale_date,
      customer_id,
      first_name,
      last_name,
      date_of_birth,
      prescription_id,
      prescription_number,
      doctor_name,
      doctor_license,
      sale_item_id,
      medicine_id,
      medicine_name,
      generic_name,
      strength,
      form,
      controlled_substance,
      quantity,
      unit_price,
      line_total
    `
    )
    .eq("tenant_id", tenantId)
    .gte("sale_date", filters.periodStart)
    .lte("sale_date", filters.periodEnd)
    .order("sale_date", { ascending: true })

  if (filters.medicineName) {
    query = query.ilike("medicine_name", `%${filters.medicineName}%`)
  }

  if (filters.doctorName) {
    query = query.ilike("doctor_name", `%${filters.doctorName}%`)
  }

  // Schedule is stored on medicines.controlled_substance_schedule;
  // if the view doesn't yet expose it, this filter will simply be ignored.
  if (filters.schedule) {
    query = query.eq("controlled_substance_schedule", filters.schedule)
  }

  const { data, error } = await query
  if (error) throw error

  return (data || []) as DdaNarcoticRegisterRow[]
}

// ---------------------------------------------------------------------------
// Reports overview
// ---------------------------------------------------------------------------

export interface ReportsOverviewData {
  sales: Record<string, unknown>[]
  inventory: Record<string, unknown>[]
  revenue: Record<string, unknown>[]
  topProducts: Record<string, unknown>[]
  customers: Record<string, unknown>[]
  prescriptions: Record<string, unknown>[]
}

/** Loads the raw datasets backing `/api/reports/overview`. */
export async function getReportsOverviewData(
  supabase: SupabaseClient,
  tenantId: string,
  from: string,
  to: string
): Promise<ReportsOverviewData> {
  const [salesResult, inventoryResult, revenueResult, topProductsResult, customersResult, prescriptionsResult] =
    await Promise.all([
      supabase
        .from("sales")
        .select("sale_date, total_amount")
        .eq("tenant_id", tenantId)
        .gte("sale_date", from)
        .lte("sale_date", to)
        .order("sale_date"),
      supabase
        .from("medicines")
        .select("id, name, stock_quantity, minimum_stock, unit_price, expiry_date, categories(name), suppliers(id, name)")
        .eq("tenant_id", tenantId)
        .order("stock_quantity", { ascending: false }),
      supabase
        .from("sales")
        .select(
          "id, sale_number, invoice_number, total_amount, sale_date, payment_method, payment_status, customer_id, customers(first_name, last_name, phone)"
        )
        .eq("tenant_id", tenantId)
        .gte("sale_date", from)
        .lte("sale_date", to),
      supabase
        .from("sale_items")
        .select("id, quantity, total_price, medicines(name, strength, form), sales!inner(sale_date, tenant_id)")
        .eq("sales.tenant_id", tenantId)
        .gte("sales.sale_date", from)
        .lte("sales.sale_date", to),
      supabase.from("customers").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase
        .from("prescriptions")
        .select("*, customers(first_name, last_name)")
        .eq("tenant_id", tenantId)
        .gte("prescribed_date", from)
        .lte("prescribed_date", to),
    ])

  return {
    sales: (salesResult.data || []) as Record<string, unknown>[],
    inventory: (inventoryResult.data || []) as Record<string, unknown>[],
    revenue: (revenueResult.data || []) as Record<string, unknown>[],
    topProducts: (topProductsResult.data || []) as Record<string, unknown>[],
    customers: (customersResult.data || []) as Record<string, unknown>[],
    prescriptions: (prescriptionsResult.data || []) as Record<string, unknown>[],
  }
}

// ---------------------------------------------------------------------------
// Audit logs list
// ---------------------------------------------------------------------------

export interface AuditLogFilters {
  page: number
  limit: number
  tableName?: string
  action?: string
  dateFrom?: string
  dateTo?: string
}

export interface AuditLogRow {
  id: string
  user_id: string | null
  table_name: string | null
  record_id: string | null
  action: string | null
  created_at: string | null
  ip_address: string | null
  user_agent: string | null
  tenant_id: string | null
}

export interface AuditLogListResult {
  data: AuditLogRow[]
  count: number
  error: Error | null
}

/** Tenant-scoped, paginated `audit_logs` listing used by `/api/reports/audit-logs`. */
export async function listAuditLogs(
  supabase: SupabaseClient,
  tenantId: string,
  filters: AuditLogFilters
): Promise<AuditLogListResult> {
  let query = supabase
    .from("audit_logs")
    .select(
      `
      id,
      user_id,
      table_name,
      record_id,
      action,
      created_at,
      ip_address,
      user_agent,
      tenant_id
    `,
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)

  if (filters.tableName) {
    query = query.eq("table_name", filters.tableName)
  }

  if (filters.action) {
    query = query.eq("action", filters.action)
  }

  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom)
  }

  if (filters.dateTo) {
    query = query.lte("created_at", filters.dateTo)
  }

  query = query.order("created_at", { ascending: false })

  const from = (filters.page - 1) * filters.limit
  const to = from + filters.limit - 1
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) {
    return { data: [], count: 0, error: new Error(error.message) }
  }

  return { data: (data || []) as AuditLogRow[], count: count || 0, error: null }
}

// ---------------------------------------------------------------------------
// Dead stock (item 13 of the 2026-08 domain audit)
// ---------------------------------------------------------------------------

export interface DeadStockRow {
  medicine_id: string
  medicine_name: string
  supplier_name: string | null
  stock_quantity: number
  inventory_value: number
  last_sold_date: string | null
  expiry_date: string | null
}

/** Medicines with in-stock quantity but no sale in `sinceDays` (default 90) —
 *  never surfaced anywhere before this; the pharmacy owner had no way to see
 *  "this is tying up money and about to expire unsold" without eyeballing the
 *  whole inventory list against sales history by hand. */
export async function getDeadStockReport(
  supabase: SupabaseClient,
  tenantId: string,
  sinceDays = 90
): Promise<{ data: DeadStockRow[]; error: Error | null }> {
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: medicines, error: medErr } = await supabase
    .from("medicines")
    .select("id, name, stock_quantity, cost_price, expiry_date, suppliers (name)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .gt("stock_quantity", 0)

  if (medErr) return { data: [], error: new Error(medErr.message) }
  const medicineRows = (medicines || []) as Array<{
    id: string
    name: string
    stock_quantity: number
    cost_price: number | string
    expiry_date: string | null
    suppliers: { name: string } | { name: string }[] | null
  }>
  if (medicineRows.length === 0) return { data: [], error: null }

  const medicineIds = medicineRows.map((m) => m.id)
  const { data: saleItems, error: siErr } = await supabase
    .from("sale_items")
    .select("medicine_id, sales (sale_date)")
    .in("medicine_id", medicineIds)

  if (siErr) return { data: [], error: new Error(siErr.message) }

  // This report exists to flag stock "about to expire unsold" — the static
  // medicines.expiry_date is set once at creation and never kept in sync with
  // real per-lot batches, so it would silently undermine that purpose for any
  // medicine with more than one batch. Same fix as the inventory list/filters.
  const batchAgg = await fetchBatchAggMap(supabase, medicineIds, null)

  const lastSoldByMedicine = new Map<string, string>()
  for (const row of (saleItems || []) as Array<{ medicine_id: string; sales: { sale_date: string } | { sale_date: string }[] | null }>) {
    const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales
    if (!sale?.sale_date) continue
    const existing = lastSoldByMedicine.get(row.medicine_id)
    if (!existing || sale.sale_date > existing) lastSoldByMedicine.set(row.medicine_id, sale.sale_date)
  }

  const rows: DeadStockRow[] = medicineRows
    .map((m) => {
      const lastSold = lastSoldByMedicine.get(m.id) ?? null
      const supplier = Array.isArray(m.suppliers) ? m.suppliers[0] : m.suppliers
      return {
        medicine_id: m.id,
        medicine_name: m.name,
        supplier_name: supplier?.name ?? null,
        stock_quantity: m.stock_quantity,
        inventory_value: m.stock_quantity * Number(m.cost_price || 0),
        last_sold_date: lastSold,
        expiry_date: effectiveExpiryFromAgg(batchAgg.get(m.id), m.expiry_date),
      }
    })
    .filter((r) => !r.last_sold_date || r.last_sold_date < cutoff)
    .sort((a, b) => b.inventory_value - a.inventory_value)

  return { data: rows, error: null }
}
