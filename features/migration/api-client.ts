import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import {
  balanceLines,
  onboardingDotnetApi,
  openingStockLines,
  openingStockTotal,
  partyLines,
} from "@/lib/api/onboarding-api"

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
      return { data: await onboardingDotnetApi.getSession(), error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to load migration session" }
    }
  },

  startSession: async (input: { cutover_date: string; notes?: string | null }): Promise<{ data: MigrationSession | null; error: string | null }> => {
    try {
      return { data: await onboardingDotnetApi.startSession(input), error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to start migration session" }
    }
  },

  /** Commits the session; every category posts to `branchId` (the branch chosen in the wizard). */
  completeSession: async (branchId?: string | null): Promise<{ error: string | null }> => {
    try {
      await onboardingDotnetApi.commit(branchId)
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to complete migration" }
    }
  },

  importOpeningStock: async (
    _branch_id: string,
    items: OpeningStockItem[]
  ): Promise<{ data: OpeningStockResult | null; error: string | null }> => {
    try {
      const imported = await onboardingDotnetApi.saveCategory("Stock", openingStockLines(items), "Opening stock")
      return {
        data: { imported, failed: [], warnings: [], totalValue: openingStockTotal(items), voucherId: null },
        error: null,
      }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to import opening stock" }
    }
  },

  setOpeningCash: async (amount: number, _branch_id?: string | null): Promise<{ error: string | null }> => {
    try {
      await onboardingDotnetApi.saveCategory("Cash", balanceLines(amount), "Opening cash")
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to record opening cash" }
    }
  },

  setOpeningBank: async (amount: number, _branch_id?: string | null): Promise<{ error: string | null }> => {
    try {
      await onboardingDotnetApi.saveCategory("Bank", balanceLines(amount), "Opening bank balance")
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to record opening bank balance" }
    }
  },

  importOpeningCustomers: async (
    entries: { customer_id: string; amount: number }[]
  ): Promise<{ data: OpeningPartyResult | null; error: string | null }> => {
    try {
      const imported = await onboardingDotnetApi.saveCategory(
        "Customer",
        partyLines(entries.map((e) => ({ id: e.customer_id, amount: e.amount }))),
        "Opening customer balances",
      )
      return { data: { imported, failed: [], voucherId: null }, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to import opening customer balances" }
    }
  },

  importOpeningSuppliers: async (
    entries: { supplier_id: string; amount: number }[]
  ): Promise<{ data: OpeningPartyResult | null; error: string | null }> => {
    try {
      const imported = await onboardingDotnetApi.saveCategory(
        "Supplier",
        partyLines(entries.map((e) => ({ id: e.supplier_id, amount: e.amount }))),
        "Opening supplier balances",
      )
      return { data: { imported, failed: [], voucherId: null }, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to import opening supplier balances" }
    }
  },
}
