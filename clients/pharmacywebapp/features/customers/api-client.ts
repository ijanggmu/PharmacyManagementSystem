import { extractFormErrors, type FieldErrorMap } from "@/lib/utils/form-errors"
import {
  customersDotnetApi,
  type CustomerLedgerRow,
  type CustomerLedgerPage,
  type CustomerStatement,
  type CustomerSummary,
  type DotnetCustomerLoyalty,
} from "@/lib/api/customers-api"
import { getCustomerOpenInvoicesOnDotnet, type CustomerOpenInvoicesPage } from "@/lib/api/sales-api"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"

export interface Customer {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  address: string | null
  date_of_birth: string | null
  insurance_provider: string | null
  insurance_number: string | null
  allergies?: string[]
  chronic_conditions?: string[]
  current_medications?: string[]
  /** The stored active flag (.NET Customer.IsActive); what the status filter and status column use. */
  is_active?: boolean
  created_at: string
  /** Customer number printed on the card and encoded in its QR, e.g. "C-000123". */
  code?: string | null
  /** Positive = the customer owes the pharmacy (credit sales not yet paid). */
  current_balance?: number
  /** Most the customer may owe on account; null = no limit. */
  credit_limit?: number | null
  /** credit_limit − current_balance; null when there is no limit. */
  available_credit?: number | null
  /** Payment terms in days: a sale on account falls due this many days later. null = none. */
  credit_days?: number | null
  /** Loyalty programme member (earns points, gets the member discount). */
  is_member?: boolean
  /** Agreed to automated SMS (refill and automatic dues reminders). Turn off when the customer replies STOP. */
  sms_consent?: boolean
  /** Points available to redeem. */
  loyalty_points?: number
  prescriptions: { id: string }[]
  sales: { id: string; total_amount: string }[]
}

export interface CustomersFilters {
  search?: string
  /** "active" / "inactive" filter on the stored active flag (same as `activity`). */
  status?: "active" | "inactive"
  /** Preferred: server filters on the stored active flag (isActive). */
  activity?: "active" | "inactive"
  /** Multi-select form: a single value maps to activity; both or none means no filter. */
  statuses?: ("active" | "inactive")[]
  /** Include prescription/sale id stubs in list rows */
  includeRelations?: boolean
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

export interface CustomersResponse {
  data: Customer[]
  total?: number
  error: string | null
}

export interface CreateCustomerInput {
  first_name: string
  last_name: string
  email?: string
  phone?: string
  address?: string
  date_of_birth?: string
  insurance_provider?: string
  insurance_number?: string
  allergies?: string[]
  chronic_conditions?: string[]
  current_medications?: string[]
  /** Most the customer may owe on account; null/undefined = no limit. */
  credit_limit?: number | null
  /** Payment terms in days; null/undefined = none. */
  credit_days?: number | null
  /** Join the loyalty programme. */
  is_member?: boolean
  /** Agreed to automated SMS reminders. */
  sms_consent?: boolean
}

interface CustomerMutationResult {
  data: Customer | null
  error: string | null
  fieldErrors?: FieldErrorMap
}

export const customersApi = {
  getCustomers: async (filters?: CustomersFilters): Promise<CustomersResponse> => {
    try {
      return await customersDotnetApi.list(filters)
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch customers",
      }
    }
  },

  /** Every customer matching the filters (pages through the 200-row server cap). Used for export. */
  getAllCustomers: async (filters?: Omit<CustomersFilters, "page" | "limit">): Promise<CustomersResponse> => {
    try {
      return await customersDotnetApi.listAll(filters)
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch customers",
      }
    }
  },

  getCustomer: async (id: string): Promise<{ data: Customer | null; error: string | null }> => {
    try {
      return { data: await customersDotnetApi.get(id), error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to fetch customer",
      }
    }
  },

  /** Purchase count, total spent (completed sales, all visible branches) and prescription count. */
  getSummary: async (customerId: string): Promise<{ data: CustomerSummary | null; error: string | null }> => {
    try {
      return { data: await customersDotnetApi.summary(customerId), error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to load the customer's totals") }
    }
  },

  getLoyalty: async (customerId: string): Promise<{ data: DotnetCustomerLoyalty | null; error: string | null }> => {
    try {
      return { data: await customersDotnetApi.loyalty(customerId), error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to load loyalty points") }
    }
  },

  adjustLoyalty: async (customerId: string, points: number, reason: string): Promise<{ data: number | null; error: string | null }> => {
    try {
      return { data: await customersDotnetApi.adjustLoyalty(customerId, points, reason), error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to adjust points") }
    }
  },

  /** Looks a customer up by the number on their card (typed or scanned). `data` is null when no one has it. */
  getCustomerByCode: async (code: string): Promise<{ data: Customer | null; error: string | null }> => {
    try {
      return { data: await customersDotnetApi.getByCode(code), error: null }
    } catch (error) {
      const status = (error as { normalized?: { status?: number } })?.normalized?.status
      if (status === 404) return { data: null, error: null }
      return { data: null, error: error instanceof Error ? error.message : "Failed to look up the customer" }
    }
  },

  createCustomer: async (
    customer: CreateCustomerInput
  ): Promise<CustomerMutationResult> => {
    try {
      return { data: await customersDotnetApi.create(customer), error: null }
    } catch (error) {
      const mapped = extractFormErrors(error)
      return {
        data: null,
        error: mapped.formMessage || "Failed to create customer",
        fieldErrors: mapped.fieldErrors,
      }
    }
  },

  updateCustomer: async (
    id: string,
    updates: Partial<Customer>
  ): Promise<CustomerMutationResult> => {
    try {
      return { data: await customersDotnetApi.update(id, updates), error: null }
    } catch (error) {
      const mapped = extractFormErrors(error)
      return {
        data: null,
        error: mapped.formMessage || "Failed to update customer",
        fieldErrors: mapped.fieldErrors,
      }
    }
  },

  /**
   * Customer AR ledger, newest first, from the .NET paged ledger mapped to ledger rows.
   */
  getLedger: async (id: string, limit = 200): Promise<{ data: CustomerLedgerRow[]; error: string | null }> => {
    try {
      return { data: await customersDotnetApi.ledger(id, limit), error: null }
    } catch (error) {
      return {
        data: [],
        error: stockErrorMessage(error, "Failed to load customer ledger"),
      }
    }
  },

  /** Paged variant of `getLedger`, used wherever a page control is shown over the ledger entries. */
  getLedgerPage: async (
    id: string,
    page: number,
    limit = 20,
    branchId?: string | null
  ): Promise<{ data: CustomerLedgerPage | null; error: string | null }> => {
    try {
      return { data: await customersDotnetApi.ledgerPage(id, page, limit, branchId), error: null }
    } catch (error) {
      return {
        data: null,
        error: stockErrorMessage(error, "Failed to load customer ledger"),
      }
    }
  },

  /** Printable AR statement for whole Nepal days `from`..`to` (yyyy-mm-dd AD, inclusive). */
  getStatement: async (
    id: string,
    from: string,
    to: string,
    branchId?: string | null
  ): Promise<{ data: CustomerStatement | null; error: string | null }> => {
    try {
      return { data: await customersDotnetApi.statement(id, from, to, branchId), error: null }
    } catch (error) {
      return {
        data: null,
        error: stockErrorMessage(error, "Failed to load customer statement"),
      }
    }
  },

  /**
   * A customer's open invoices (unpaid/partially-paid sales with a balance due), paged, oldest-first.
   * Backed by the Sales module's SearchSales query filtered by `onlyWithBalanceDue` — there is no
   * dedicated legacy-style route, the deleted `/api/customers/[id]/open-invoices` route this replaces
   * was never ported to .NET on its own.
   */
  getOpenInvoicesPage: async (
    id: string,
    page: number,
    limit = 20,
    branchId?: string | null
  ): Promise<{ data: CustomerOpenInvoicesPage | null; error: string | null }> => {
    try {
      return { data: await getCustomerOpenInvoicesOnDotnet(id, page, limit, branchId), error: null }
    } catch (error) {
      return {
        data: null,
        error: stockErrorMessage(error, "Failed to load open invoices"),
      }
    }
  },

  /** Moves the customer to the trash. A customer with an account balance is refused with the server's reason. */
  deleteCustomer: async (id: string): Promise<{ error: string | null }> => {
    try {
      await customersDotnetApi.delete(id)
      return { error: null }
    } catch (error) {
      return { error: stockErrorMessage(error, "Failed to delete customer") }
    }
  },
}
