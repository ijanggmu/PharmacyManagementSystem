import { describe, expect, it } from "vitest"
import {
  toAuditLogPage,
  toAuditLogRow,
  toAuditTrailComplianceReport,
  toDeadStockRow,
  toInventoryDiscrepancyReport,
  type DotnetDeadStockRowDto,
  type DotnetEntityAuditLogDto,
  type DotnetAuditTrailComplianceReportDto,
  type DotnetInventoryDiscrepancyReportDto,
} from "@/lib/api/reports-api"

describe("toDeadStockRow", () => {
  const dto: DotnetDeadStockRowDto = {
    medicineId: "m-1",
    medicineName: "Amoxicillin 500mg",
    stockQuantity: 12,
    inventoryValue: 340.5,
    lastSoldAtUtc: "2026-06-01T00:00:00Z",
    nearestExpiryDate: "2027-01-31",
  }

  it("maps a .NET dead-stock row to the report shape", () => {
    expect(toDeadStockRow(dto)).toEqual({
      medicine_id: "m-1",
      medicine_name: "Amoxicillin 500mg",
      supplier_name: null,
      stock_quantity: 12,
      inventory_value: 340.5,
      last_sold_date: "2026-06-01T00:00:00Z",
      expiry_date: "2027-01-31",
      branch_id: null,
    })
    expect(toDeadStockRow({ ...dto, branchId: "b-1" }).branch_id).toBe("b-1")
  })

  it("keeps null for a medicine that was never sold or has no expiry", () => {
    const row = toDeadStockRow({ ...dto, lastSoldAtUtc: null, nearestExpiryDate: null })
    expect(row.last_sold_date).toBeNull()
    expect(row.expiry_date).toBeNull()
  })
})

describe("toAuditLogRow / toAuditLogPage", () => {
  const dto: DotnetEntityAuditLogDto = {
    id: "a-1",
    userId: "u-1",
    tableName: "medicines",
    recordId: "r-9",
    action: "UPDATE",
    occurredAtUtc: "2026-10-05T10:00:00Z",
    tenantId: "t-1",
  }

  it("maps an entity log to the audit-logs row shape, leaving IP and user agent empty", () => {
    expect(toAuditLogRow(dto)).toEqual({
      id: "a-1",
      user_id: "u-1",
      table_name: "medicines",
      record_id: "r-9",
      action: "UPDATE",
      created_at: "2026-10-05T10:00:00Z",
      ip_address: null,
      user_agent: null,
      tenant_id: "t-1",
    })
  })

  it("maps a PagedResponse to rows and the legacy meta fields", () => {
    const page = toAuditLogPage({ items: [dto], pageNumber: 2, pageSize: 50, totalCount: 120, totalPages: 3 })
    expect(page.rows).toHaveLength(1)
    expect(page.meta).toEqual({ page: 2, limit: 50, total: 120, totalPages: 3 })
  })
})

describe("toInventoryDiscrepancyReport", () => {
  const dto: DotnetInventoryDiscrepancyReportDto = {
    generatedAtUtc: "2026-10-06T00:00:00Z",
    totalMedicines: 40,
    lowStockCount: 2,
    lowStock: [
      { medicineId: "m-1", medicineName: "Paracetamol", currentStock: 3, reorderLevel: 10 },
      { medicineId: "m-2", medicineName: "Insulin", currentStock: 0, reorderLevel: 5 },
    ],
  }

  it("maps low-stock rows to the compliance report shape", () => {
    const report = toInventoryDiscrepancyReport(dto, "2026-09-01", "2026-10-01")
    expect(report.reportType).toBe("Inventory Discrepancy Report")
    expect(report.period).toEqual({ startDate: "2026-09-01", endDate: "2026-10-01" })
    expect(report.summary).toEqual({ totalMedicines: 40, discrepancies: 2, lowStock: 2, overstock: 0 })
    expect(report.discrepancies[0]).toEqual({
      medicine: "Paracetamol",
      currentStock: 3,
      minimumStock: 10,
      maximumStock: null,
      status: "low",
    })
  })
})

describe("toAuditTrailComplianceReport", () => {
  const dto: DotnetAuditTrailComplianceReportDto = {
    fromUtc: null,
    toUtc: null,
    totalLogs: 1,
    byAction: { UPDATE: 1 },
    phiAccessCount: 0,
    logs: [
      {
        id: "a-1",
        occurredAtUtc: "2026-10-05T10:00:00Z",
        userId: "u-1",
        userName: "Asha",
        table: "sales",
        recordKey: "s-7",
        action: "UPDATE",
        tenantId: "t-1",
      },
    ],
  }

  it("maps the summary and log rows to the compliance report shape", () => {
    const report = toAuditTrailComplianceReport(dto, "2026-10-01", "2026-10-06")
    expect(report.reportType).toBe("Audit Trail Report")
    expect(report.period).toEqual({ startDate: "2026-10-01", endDate: "2026-10-06" })
    expect(report.summary).toEqual({ totalLogs: 1, byAction: { UPDATE: 1 }, phiAccessCount: 0 })
    expect(report.logs).toEqual([
      {
        id: "a-1",
        user_id: "u-1",
        table_name: "sales",
        record_id: "s-7",
        action: "UPDATE",
        created_at: "2026-10-05T10:00:00Z",
        tenant_id: "t-1",
      },
    ])
  })
})
