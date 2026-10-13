// Deterministic fixtures for the stub .NET API (see server.mjs). Keep them small: one tenant, one
// branch, a couple of medicines. Paths are matched against the pathname only (no query string).

export const TENANT = "demo-pharmacy"
export const USER_ID = "00000000-0000-4000-8000-000000000001"

/** Every tenant-level permission (src/Modules/{Module}/{Module}.Contracts/Authorization) — the e2e user is the tenant Admin. */
const PERMISSIONS = [
  "Accounting.Accounts.Activate", "Accounting.Accounts.Create", "Accounting.Accounts.Deactivate",
  "Accounting.Accounts.Update", "Accounting.Accounts.View", "Accounting.Banking.Reconcile",
  "Accounting.Banking.RecordDeposit", "Accounting.Banking.View", "Accounting.Expenses.Delete",
  "Accounting.Expenses.Record", "Accounting.Expenses.Update", "Accounting.Expenses.View",
  "Accounting.PostingLock.CloseFiscalYear", "Accounting.PostingLock.Update", "Accounting.PostingLock.View",
  "Accounting.Reports.View", "Accounting.Vouchers.Create", "Accounting.Vouchers.Delete", "Accounting.Vouchers.Post",
  "Accounting.Vouchers.Reverse", "Accounting.Vouchers.Update", "Accounting.Vouchers.View", "Accounting.Vouchers.Void",
  "Approvals.View", "AuditTrails.View", "Branches.View", "Branches.Manage",
  "Customers.Customers.Create", "Customers.Customers.Update", "Customers.Customers.View",
  "Customers.Ledger.RecordPayment", "Customers.Ledger.View", "Customers.Ledger.VoidPayment",
  "Inventory.Batches.AdjustStock", "Inventory.Batches.Create", "Inventory.Batches.View",
  "Inventory.Medicines.Create", "Inventory.Medicines.Update", "Inventory.Medicines.View", "Inventory.Reports.View",
  "Prescriptions.Prescriptions.Create", "Prescriptions.Prescriptions.View", "Prescriptions.Reports.View",
  "Purchasing.DirectGoodsReceipts.Create", "Purchasing.DirectGoodsReceipts.View",
  "Purchasing.PurchaseOrders.Approve", "Purchasing.PurchaseOrders.Create", "Purchasing.PurchaseOrders.Receive",
  "Purchasing.PurchaseOrders.View", "Reference.Dashboard.View", "Reference.Settings.Update", "Reference.Settings.View",
  "Sales.CashShifts.Close", "Sales.CashShifts.Start", "Sales.CashShifts.View", "Sales.Ird.Manage", "Sales.Ird.View",
  "Sales.Reports.View", "Sales.Returns.Create", "Sales.Returns.View", "Sales.Sales.Cancel", "Sales.Sales.Create",
  "Sales.Sales.View", "Suppliers.Ledger.RecordPayment", "Suppliers.Ledger.View", "Suppliers.Suppliers.Create",
  "Suppliers.Suppliers.Update", "Suppliers.Suppliers.View", "Users.View",
].map((name) => `Permissions.${name}`)

export const sessionClaims = {
  sub: USER_ID,
  email: "owner@demo-pharmacy.test",
  tenant: TENANT,
  role: ["Admin"],
  permission: PERMISSIONS,
}

export const BRANCH = {
  id: "00000000-0000-4000-8000-0000000000b1",
  tenantId: TENANT,
  name: "Main Branch",
  code: "MAIN",
  isActive: true,
  isDefault: true,
  createdOnUtc: "2026-01-01T00:00:00Z",
}

function medicine(overrides) {
  return {
    genericName: null, categoryId: null, reorderLevel: 10, isControlled: false, branchQuantityOnHand: null,
    sellableQuantityOnHand: null, branchSellableQuantityOnHand: null, isArchived: false,
    createdAtUtc: "2026-01-01T00:00:00Z", updatedAtUtc: null, batchNearestExpiry: "2027-12-31", batchCount: 1,
    batchRackLocations: [], fefoPicks: [], costPrice: 1, form: "tablet", strength: null, supplierId: null,
    barcode: null, description: null, maximumStock: null, prescriptionRequired: false, brandName: null, dosage: null,
    sideEffects: null, storageInstructions: null, storageTempMinC: null, storageTempMaxC: null,
    requiresColdChain: false, unitsPerPack: null, unitLabel: null, isTaxable: false, supplierInvoiceNumber: null,
    vatAmount: null, controlledSchedule: null,
    ...overrides,
  }
}

/** Paracetamol sells by the tablet or by the strip of 10; Amoxicillin only by the capsule. */
export const MEDICINES = [
  medicine({
    id: "00000000-0000-4000-8000-000000000101",
    name: "Paracetamol 500mg",
    genericName: "Paracetamol",
    totalQuantityOnHand: 200,
    unitPrice: 2,
    unitsPerPack: 10,
    unitLabel: "strip",
    batchRackLocations: ["A1"],
    fefoPicks: [{ batchNo: "PCM-2401", expiryDate: "2027-12-31", rackLocation: "A1", quantityOnHand: 200, sellingPrice: 2 }],
  }),
  medicine({
    id: "00000000-0000-4000-8000-000000000102",
    name: "Amoxicillin 250mg",
    genericName: "Amoxicillin",
    form: "capsule",
    totalQuantityOnHand: 60,
    unitPrice: 15,
    batchRackLocations: ["B2"],
    fefoPicks: [{ batchNo: "AMX-2402", expiryDate: "2027-06-30", rackLocation: "B2", quantityOnHand: 60, sellingPrice: 15 }],
  }),
]

const paged = (items) => ({ items, totalCount: items.length, pageNumber: 1, pageSize: Math.max(items.length, 10), totalPages: 1 })

/** @type {{ method: string, path: RegExp, status?: number, body: unknown }[]} */
export const routes = [
  {
    method: "GET",
    path: /^\/api\/v1\/identity\/profile$/,
    body: { id: USER_ID, userName: "owner", firstName: "Sita", lastName: "Sharma", email: "owner@demo-pharmacy.test" },
  },
  {
    method: "GET",
    path: /^\/api\/v1\/reference\/dashboard-context$/,
    body: {
      userId: USER_ID,
      userName: "Sita Sharma",
      userEmail: "owner@demo-pharmacy.test",
      tenantId: TENANT,
      tenantName: "Demo Pharmacy",
      tenantPlan: "pro",
      lowStockCount: 0,
      expiringCount: 0,
      pendingPrescriptionsCount: 0,
      pendingReturnsCount: 0,
      pendingRefundsCount: 0,
      branchCount: 1,
    },
  },
  { method: "GET", path: /^\/api\/v1\/customers$/, body: { ...paged([]), totalCount: 42 } },
  { method: "GET", path: /^\/api\/v1\/inventory\/medicines$/, body: paged(MEDICINES) },
  { method: "GET", path: /^\/api\/v1\/sales$/, body: paged([]) },
  { method: "GET", path: /^\/api\/v1\/branches\/context$/, body: { branches: [BRANCH], currentBranchId: BRANCH.id } },
  { method: "GET", path: /^\/api\/v1\/branches$/, body: paged([BRANCH]) },
  { method: "GET", path: /^\/api\/v1\/reference\/settings\/all$/, body: {} },
  { method: "GET", path: /^\/api\/v1\/reference\/licenses$/, body: [] },
  { method: "GET", path: /^\/api\/v1\/reference\/categories$/, body: paged([]) },
  { method: "GET", path: /^\/api\/v1\/sales\/price-levels$/, body: [] },
  { method: "GET", path: /^\/api\/v1\/notifications$/, body: paged([]) },
  { method: "GET", path: /^\/api\/v1\/prescriptions$/, body: paged([]) },
  {
    method: "GET",
    path: /^\/api\/v1\/prescriptions\/reports\/stats$/,
    body: { total: 0, pending: 0, partiallyFilled: 0, filled: 0, cancelled: 0 },
  },
  {
    method: "GET",
    path: /^\/api\/v1\/sales\/stats$/,
    body: { saleCount: 3, totalRevenue: 1250, totalDiscount: 0, averageSaleAmount: 416.67 },
  },
  { method: "GET", path: /^\/api\/v1\/inventory\/reports\/reorder-suggestions$/, body: [] },
  { method: "GET", path: /^\/api\/v1\/inventory\/reports\/expiring-batches$/, body: [] },
]
