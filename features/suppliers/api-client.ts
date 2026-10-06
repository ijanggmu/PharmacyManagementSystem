import {
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPut,
  apiDelete,
  getCSRFToken,
} from "@/lib/api/client-helpers"
import { extractFormErrors, type FieldErrorMap } from "@/lib/utils/form-errors"
import { backendTarget } from "@/lib/api/backend-target"
import {
  suppliersDotnetApi,
  type LegacySupplierCostHistoryRow,
  type LegacySupplierLedgerSummary,
} from "@/lib/api/suppliers-api"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  reconciliation_account_ref?: string | null
  payable_amount?: number
  receivable_amount?: number
  latest_payment_method?: "cash" | "bank" | null
  latest_payment_date?: string | null
  latest_supplier_bill_number?: string | null
  latest_supplier_bill_date?: string | null
  created_at: string
}

export interface SuppliersFilters {
  search?: string
  status?: "all" | "active" | "incomplete"
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

export interface SuppliersResponse {
  data: Supplier[]
  error: string | null
  total?: number
}

interface SupplierMutationResult {
  data: Supplier | null
  error: string | null
  fieldErrors?: FieldErrorMap
}

export interface CreateSupplierInput {
  name: string
  contact_person?: string
  email?: string
  phone?: string
  address?: string
  reconciliation_account_ref?: string | null
}

function suppliersListPath(filters?: SuppliersFilters): string {
  const p = new URLSearchParams()
  if (filters?.search?.trim()) p.set("search", filters.search.trim())
  if (filters?.page != null) p.set("page", String(filters.page))
  if (filters?.limit != null) p.set("limit", String(filters.limit))
  if (filters?.sortBy) p.set("sortBy", filters.sortBy)
  if (filters?.sortOrder) p.set("sortOrder", filters.sortOrder)
  if (filters?.status && filters.status !== "all") {
    p.set("profile", filters.status === "active" ? "active" : "incomplete")
  }
  const q = p.toString()
  return `/api/suppliers${q ? `?${q}` : ""}`
}

export const suppliersApi = {
  getSuppliers: async (filters?: SuppliersFilters): Promise<SuppliersResponse> => {
    try {
      if (backendTarget("SUPPLIERS") === "dotnet") return await suppliersDotnetApi.list(filters)
      const { data, meta } = await apiGetWithMeta<Supplier[]>(suppliersListPath(filters))
      return {
        data: data ?? [],
        error: null,
        total: meta?.total ?? (data?.length ?? 0),
      }
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch suppliers",
      }
    }
  },

  getSupplier: async (id: string): Promise<{ data: Supplier | null; error: string | null }> => {
    try {
      if (backendTarget("SUPPLIERS") === "dotnet") return { data: await suppliersDotnetApi.get(id), error: null }
      const data = await apiGet<Supplier>(`/api/suppliers/${encodeURIComponent(id)}`)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to fetch supplier",
      }
    }
  },

  createSupplier: async (
    supplier: CreateSupplierInput
  ): Promise<SupplierMutationResult> => {
    try {
      if (backendTarget("SUPPLIERS") === "dotnet") {
        return { data: await suppliersDotnetApi.create(supplier), error: null }
      }
      const token = await getCSRFToken()
      const payload = {
        name: supplier.name,
        contact_person: supplier.contact_person || undefined,
        email: supplier.email || undefined,
        phone: supplier.phone || undefined,
        address: supplier.address || undefined,
        reconciliation_account_ref: supplier.reconciliation_account_ref ?? undefined,
      }
      const data = await apiPost<Supplier>("/api/suppliers", payload, token)
      return { data, error: null }
    } catch (error) {
      const mapped = extractFormErrors(error)
      return {
        data: null,
        error: mapped.formMessage || "Failed to create supplier",
        fieldErrors: mapped.fieldErrors,
      }
    }
  },

  updateSupplier: async (
    id: string,
    updates: Partial<Supplier>
  ): Promise<SupplierMutationResult> => {
    try {
      if (backendTarget("SUPPLIERS") === "dotnet") {
        return { data: await suppliersDotnetApi.update(id, updates), error: null }
      }
      const token = await getCSRFToken()
      const data = await apiPut<Supplier>(
        `/api/suppliers/${encodeURIComponent(id)}`,
        updates,
        token
      )
      return { data, error: null }
    } catch (error) {
      const mapped = extractFormErrors(error)
      return {
        data: null,
        error: mapped.formMessage || "Failed to update supplier",
        fieldErrors: mapped.fieldErrors,
      }
    }
  },

  deleteSupplier: async (id: string): Promise<{ error: string | null }> => {
    try {
      const token = await getCSRFToken()
      await apiDelete(`/api/suppliers/${encodeURIComponent(id)}`, token)
      return { error: null }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to delete supplier",
      }
    }
  },

  /** Legacy AP ledger rows, oldest first. Dotnet branch maps the .NET ledger (all pages) to the same rows. */
  getLedger: async (id: string): Promise<{ data: LegacySupplierLedgerSummary | null; error: string | null }> => {
    try {
      if (backendTarget("SUPPLIERS") === "dotnet") return { data: await suppliersDotnetApi.ledger(id), error: null }
      const data = await apiGet<LegacySupplierLedgerSummary>(`/api/supplier-ledger?supplierId=${encodeURIComponent(id)}`)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to load supplier ledger") }
    }
  },

  /** Historical unit cost per medicine, newest receipt first. */
  getCostHistory: async (id: string): Promise<{ data: LegacySupplierCostHistoryRow[]; error: string | null }> => {
    try {
      if (backendTarget("SUPPLIERS") === "dotnet") return { data: await suppliersDotnetApi.costHistory(id), error: null }
      const data = await apiGet<LegacySupplierCostHistoryRow[]>(`/api/suppliers/${encodeURIComponent(id)}/cost-history`)
      return { data: data ?? [], error: null }
    } catch (error) {
      return { data: [], error: stockErrorMessage(error, "Failed to load cost history") }
    }
  },

  statement: (id: string, from: string, to: string, branchId?: string | null) => {
    if (backendTarget("SUPPLIERS") === "dotnet") {
      return suppliersDotnetApi.statement(id, from, to, branchId)
    }
    const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${
      branchId ? `&branchId=${encodeURIComponent(branchId)}` : ""
    }`
    return apiGet<{
      supplier_id: string
      period_from: string
      period_to: string
      opening_balance: number
      closing_balance: number
      lines: Array<{
        id: string
        entry_date: string
        entry_type: string
        reference_number: string | null
        supplier_bill_number: string | null
        description: string | null
        amount: number
        balance_after: number | null
      }>
    }>(`/api/suppliers/${encodeURIComponent(id)}/statement?${q}`)
  },
}
