import { extractFormErrors, type FieldErrorMap } from "@/lib/utils/form-errors"
import {
  suppliersDotnetApi,
  type LegacySupplierCostHistoryRow,
  type LegacySupplierLedgerSummary,
  type SupplierOption,
  type SupplierOptionsQuery,
} from "@/lib/api/suppliers-api"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import { dotnetClient } from "@/lib/api/dotnet-client"

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  /** PAN / VAT registration number. */
  tax_id?: string | null
  is_active?: boolean
  updated_at?: string | null
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
  /**
   * "active"/"inactive" filter on the stored active flag; "complete"/"incomplete" on the contact profile
   * (contact person, phone and email all on file — what the table's status badge shows). "all" = no filter.
   */
  status?: "all" | "active" | "inactive" | "complete" | "incomplete"
  /** Active flag filter that combines with `profile` (unlike `status`, which is one or the other). */
  active?: "all" | "active" | "inactive"
  /** Contact-profile filter that combines with `active`. */
  profile?: "all" | "complete" | "incomplete"
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
  /** PAN / VAT registration number. */
  tax_id?: string
  reconciliation_account_ref?: string | null
}

export const suppliersApi = {
  getSuppliers: async (filters?: SuppliersFilters): Promise<SuppliersResponse> => {
    try {
      return await suppliersDotnetApi.list(filters)
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch suppliers",
      }
    }
  },

  /** Every supplier matching the filters (pages through the 200-row server cap). */
  getAllSuppliers: async (filters?: Omit<SuppliersFilters, "page" | "limit">): Promise<SuppliersResponse> => {
    try {
      return await suppliersDotnetApi.listAll(filters)
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch suppliers",
      }
    }
  },

  /** Rows for a supplier picker (id, name, phone). Prefer the useSupplierOptions hook in components. */
  getSupplierOptions: async (query?: SupplierOptionsQuery): Promise<{ data: SupplierOption[]; error: string | null }> => {
    try {
      return { data: await suppliersDotnetApi.lookup(query), error: null }
    } catch (error) {
      return { data: [], error: stockErrorMessage(error, "Failed to load suppliers") }
    }
  },

  getSupplier: async (id: string): Promise<{ data: Supplier | null; error: string | null }> => {
    try {
      return { data: await suppliersDotnetApi.get(id), error: null }
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
      return { data: await suppliersDotnetApi.create(supplier), error: null }
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
      return { data: await suppliersDotnetApi.update(id, updates), error: null }
    } catch (error) {
      const mapped = extractFormErrors(error)
      return {
        data: null,
        error: mapped.formMessage || "Failed to update supplier",
        fieldErrors: mapped.fieldErrors,
      }
    }
  },

  /** Soft delete. The .NET side refuses with 409 when the supplier has ledger or purchase history. */
  deleteSupplier: async (id: string): Promise<{ error: string | null }> => {
    try {
      await dotnetClient.delete<void>(`/suppliers/${encodeURIComponent(id)}`)
      return { error: null }
    } catch (error) {
      return { error: stockErrorMessage(error, "Failed to delete supplier") }
    }
  },

  /** AP ledger rows, oldest first. The .NET ledger (all pages) is mapped to the same shape. */
  getLedger: async (id: string, branchId?: string | null): Promise<{ data: LegacySupplierLedgerSummary | null; error: string | null }> => {
    try {
      return { data: await suppliersDotnetApi.ledger(id, branchId), error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to load supplier ledger") }
    }
  },

  /** Historical unit cost per medicine, newest receipt first. */
  getCostHistory: async (id: string): Promise<{ data: LegacySupplierCostHistoryRow[]; error: string | null }> => {
    try {
      return { data: await suppliersDotnetApi.costHistory(id), error: null }
    } catch (error) {
      return { data: [], error: stockErrorMessage(error, "Failed to load cost history") }
    }
  },

  statement: (id: string, from: string, to: string, branchId?: string | null) => {
    return suppliersDotnetApi.statement(id, from, to, branchId)
  },
}
