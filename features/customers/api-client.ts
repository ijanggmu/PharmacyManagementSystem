import {
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPut,
  apiDelete,
  getCSRFToken,
} from "@/lib/api/client-helpers"
import { extractFormErrors, type FieldErrorMap } from "@/lib/utils/form-errors"

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
  created_at: string
  prescriptions: { id: string }[]
  sales: { id: string; total_amount: string }[]
}

export interface CustomersFilters {
  search?: string
  status?: string
  /** Preferred: server filters by prescriptions/sales activity */
  activity?: "active" | "inactive"
  /** Legacy: maps to activity when a single value is provided */
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
}

interface CustomerMutationResult {
  data: Customer | null
  error: string | null
  fieldErrors?: FieldErrorMap
}

function resolveActivity(
  filters?: CustomersFilters
): "active" | "inactive" | undefined {
  if (filters?.activity) return filters.activity
  const statuses = filters?.statuses
  if (!statuses?.length) return undefined
  if (statuses.length === 1) return statuses[0]
  return undefined
}

function customersListPath(filters?: CustomersFilters): string {
  const p = new URLSearchParams()
  if (filters?.search?.trim()) p.set("search", filters.search.trim())
  if (filters?.status) p.set("status", filters.status)
  if (filters?.page != null) p.set("page", String(filters.page))
  if (filters?.limit != null) p.set("limit", String(filters.limit))
  if (filters?.sortBy) p.set("sortBy", filters.sortBy)
  if (filters?.sortOrder) p.set("sortOrder", filters.sortOrder)
  const activity = resolveActivity(filters)
  if (activity) p.set("activity", activity)
  if (filters?.includeRelations !== false) p.set("includeRelations", "1")
  const q = p.toString()
  return `/api/customers${q ? `?${q}` : ""}`
}

export const customersApi = {
  getCustomers: async (filters?: CustomersFilters): Promise<CustomersResponse> => {
    try {
      const { data, meta } = await apiGetWithMeta<Customer[]>(customersListPath(filters))
      return {
        data: data ?? [],
        total: meta?.total,
        error: null,
      }
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch customers",
      }
    }
  },

  getCustomer: async (id: string): Promise<{ data: Customer | null; error: string | null }> => {
    try {
      const data = await apiGet<Customer>(`/api/customers/${encodeURIComponent(id)}`)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to fetch customer",
      }
    }
  },

  createCustomer: async (
    customer: CreateCustomerInput
  ): Promise<CustomerMutationResult> => {
    try {
      const token = await getCSRFToken()
      const payload = {
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        address: customer.address || undefined,
        date_of_birth: customer.date_of_birth || undefined,
        insurance_provider: customer.insurance_provider || undefined,
        insurance_number: customer.insurance_number || undefined,
      }
      const data = await apiPost<Customer>("/api/customers", payload, token)
      return { data, error: null }
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
      const token = await getCSRFToken()
      const data = await apiPut<Customer>(
        `/api/customers/${encodeURIComponent(id)}`,
        updates,
        token
      )
      return { data, error: null }
    } catch (error) {
      const mapped = extractFormErrors(error)
      return {
        data: null,
        error: mapped.formMessage || "Failed to update customer",
        fieldErrors: mapped.fieldErrors,
      }
    }
  },

  deleteCustomer: async (id: string): Promise<{ error: string | null }> => {
    try {
      const token = await getCSRFToken()
      await apiDelete(`/api/customers/${encodeURIComponent(id)}`, token)
      return { error: null }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to delete customer",
      }
    }
  },
}
