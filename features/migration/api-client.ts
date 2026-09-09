import { apiGet, apiPost, getCSRFToken, apiRequestErrorMessage } from "@/lib/api/client-helpers"

export interface MigrationSession {
  id: string
  tenant_id: string
  status: "draft" | "completed"
  cutover_date: string
  notes: string | null
  created_at: string
  completed_at: string | null
}

export interface OpeningStockItem {
  medicine_id: string
  quantity: number
  unit_cost: number
  batch_number?: string | null
  expiry_date?: string | null
}

export interface OpeningStockResult {
  imported: number
  failed: { medicineId: string; message: string }[]
  warnings: { medicineId: string; message: string }[]
  totalValue: number
  voucherId: string | null
}

export interface OpeningPartyResult {
  imported: number
  failed: { id: string; message: string }[]
  voucherId: string | null
}

export const migrationApi = {
  getSession: async (): Promise<{ data: MigrationSession | null; error: string | null }> => {
    try {
      const data = await apiGet<MigrationSession | null>("/api/migration/session")
      return { data, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to load migration session" }
    }
  },

  startSession: async (input: { cutover_date: string; notes?: string | null }): Promise<{ data: MigrationSession | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPost<MigrationSession>("/api/migration/session", input, token)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to start migration session" }
    }
  },

  completeSession: async (): Promise<{ error: string | null }> => {
    try {
      const token = await getCSRFToken()
      await apiPost("/api/migration/session/complete", {}, token)
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to complete migration" }
    }
  },

  importOpeningStock: async (
    branch_id: string,
    items: OpeningStockItem[]
  ): Promise<{ data: OpeningStockResult | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPost<OpeningStockResult>("/api/migration/opening-stock", { branch_id, items }, token)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to import opening stock" }
    }
  },

  setOpeningCash: async (amount: number, branch_id?: string | null): Promise<{ error: string | null }> => {
    try {
      const token = await getCSRFToken()
      await apiPost("/api/migration/opening-cash", { amount, branch_id }, token)
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to record opening cash" }
    }
  },

  setOpeningBank: async (amount: number, branch_id?: string | null): Promise<{ error: string | null }> => {
    try {
      const token = await getCSRFToken()
      await apiPost("/api/migration/opening-bank", { amount, branch_id }, token)
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to record opening bank balance" }
    }
  },

  importOpeningCustomers: async (
    entries: { customer_id: string; amount: number }[]
  ): Promise<{ data: OpeningPartyResult | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPost<OpeningPartyResult>("/api/migration/opening-customers", { entries }, token)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to import opening customer balances" }
    }
  },

  importOpeningSuppliers: async (
    entries: { supplier_id: string; amount: number }[]
  ): Promise<{ data: OpeningPartyResult | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPost<OpeningPartyResult>("/api/migration/opening-suppliers", { entries }, token)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to import opening supplier balances" }
    }
  },
}
