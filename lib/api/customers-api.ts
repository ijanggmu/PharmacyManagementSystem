/**
 * Customer calls, switchable per backend target (CUSTOMERS). The legacy path keeps /api/customers.
 * The dotnet path uses the Customers module's /api/v1/customers and maps its single Name field to the
 * UI's first_name/last_name pair.
 *
 * Not carried over to .NET (the CustomerDto has no field for them): date_of_birth, insurance_provider,
 * insurance_number, allergies, chronic_conditions, current_medications. The per-customer prescription
 * and sales stubs are also empty on this path, so the prescriptions count and total-spent columns read 0.
 * Delete and the ledger/payment calls stay on the legacy path.
 */

import type { Customer, CustomersFilters, CreateCustomerInput, CustomersResponse } from "@/features/customers/api-client"
import { dotnetClient } from "@/lib/api/dotnet-client"

/** CustomerDto (Customers module, camelCase JSON). */
export interface DotnetCustomerDto {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  currentBalance: number
  isActive: boolean
  createdAtUtc: string
  updatedAtUtc: string | null
  deletedOnUtc?: string | null
  deletedBy?: string | null
}

export interface DotnetPagedCustomers {
  items: DotnetCustomerDto[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface CustomerUpdateInput {
  first_name?: string
  last_name?: string
  phone?: string | null
  email?: string | null
  address?: string | null
}

/** Splits a stored single-field name into the UI's first/last pair. First token is the first name. */
export function splitCustomerName(name: string): { first: string; last: string } {
  const trimmed = name.trim()
  const space = trimmed.indexOf(" ")
  if (space === -1) return { first: trimmed, last: "" }
  return { first: trimmed.slice(0, space), last: trimmed.slice(space + 1).trim() }
}

export function joinCustomerName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(" ")
}

function nullIfEmpty(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

export function toCustomer(dto: DotnetCustomerDto): Customer {
  const { first, last } = splitCustomerName(dto.name)
  return {
    id: dto.id,
    first_name: first,
    last_name: last,
    email: dto.email,
    phone: dto.phone,
    address: dto.address,
    date_of_birth: null,
    insurance_provider: null,
    insurance_number: null,
    created_at: dto.createdAtUtc,
    prescriptions: [],
    sales: [],
  }
}

export function customersListQuery(filters?: CustomersFilters): string {
  const p = new URLSearchParams()
  if (filters?.search?.trim()) p.set("search", filters.search.trim())
  if (filters?.page != null) p.set("pageNumber", String(filters.page))
  if (filters?.limit != null) p.set("pageSize", String(filters.limit))
  if (filters?.sortBy) p.set("sortBy", filters.sortBy)
  if (filters?.sortOrder) p.set("sortDir", filters.sortOrder)
  const activity = filters?.activity ?? (filters?.statuses?.length === 1 ? filters.statuses[0] : undefined)
  if (activity === "active") p.set("isActive", "true")
  if (activity === "inactive") p.set("isActive", "false")
  const q = p.toString()
  return `/api/v1/customers${q ? `?${q}` : ""}`
}

export function toCustomersResponse(page: DotnetPagedCustomers): CustomersResponse {
  return {
    data: page.items.map(toCustomer),
    total: page.totalCount,
    error: null,
  }
}

export function customerCreateBody(input: CreateCustomerInput) {
  return {
    name: joinCustomerName(input.first_name, input.last_name),
    phone: nullIfEmpty(input.phone),
    email: nullIfEmpty(input.email),
    address: nullIfEmpty(input.address),
    openingBalance: 0,
  }
}

/**
 * The .NET update is a full replace, so the current row is merged with the partial update first.
 * Fields absent from `updates` keep their stored value.
 */
export function customerUpdateBody(current: DotnetCustomerDto, updates: CustomerUpdateInput) {
  const parts = splitCustomerName(current.name)
  const name =
    updates.first_name !== undefined || updates.last_name !== undefined
      ? joinCustomerName(updates.first_name ?? parts.first, updates.last_name ?? parts.last)
      : current.name
  return {
    name,
    phone: updates.phone !== undefined ? nullIfEmpty(updates.phone) : current.phone,
    email: updates.email !== undefined ? nullIfEmpty(updates.email) : current.email,
    address: updates.address !== undefined ? nullIfEmpty(updates.address) : current.address,
    isActive: current.isActive,
  }
}

/** CustomerLedgerEntryDto (Customers module, camelCase JSON). Newest first, paged. */
export interface DotnetCustomerLedgerEntryDto {
  id: string
  customerId: string
  entryDateUtc: string
  entryType: string
  description: string | null
  debitAmount: number
  creditAmount: number
  runningBalance: number
  referenceType: string | null
  referenceId: string | null
  createdAtUtc: string
  branchId: string | null
}

/** One row of the legacy GET /api/customers/[id]/ledger response (customer-ledger-service.ts). */
export interface CustomerLedgerRow {
  id: string
  entry_date: string
  entry_type: "invoice" | "payment" | "credit_note" | "adjustment"
  description: string | null
  amount: number
  balance_after: number
  reference_number: string | null
  sale_id: string | null
  payment_id: string | null
  refund_id: string | null
  created_at: string
}

const CUSTOMER_LEDGER_TYPE: Record<string, CustomerLedgerRow["entry_type"]> = {
  OpeningBalance: "adjustment",
  Sale: "invoice",
  Payment: "payment",
  Refund: "credit_note",
  Adjustment: "adjustment",
}

/** Legacy limit rule: clamped to 1..500, default 200. */
export function clampLedgerLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return 200
  return Math.min(500, Math.max(1, Math.trunc(limit)))
}

/**
 * Maps one .NET ledger entry to the legacy row. amount is the signed movement (debit minus credit),
 * matching how the legacy balance_after is a running total. The .NET reference is routed to sale_id,
 * payment_id or refund_id by entry type. Known gap: .NET has no reference_number, so it is null.
 */
export function toCustomerLedgerRow(dto: DotnetCustomerLedgerEntryDto): CustomerLedgerRow {
  const type = CUSTOMER_LEDGER_TYPE[dto.entryType]
  if (!type) throw new Error(`Unknown customer ledger entry type from .NET API: ${dto.entryType}`)
  const ref = dto.referenceId
  return {
    id: dto.id,
    entry_date: dto.entryDateUtc,
    entry_type: type,
    description: dto.description,
    amount: dto.debitAmount - dto.creditAmount,
    balance_after: dto.runningBalance,
    reference_number: null,
    sale_id: dto.entryType === "Sale" ? ref : null,
    payment_id: dto.entryType === "Payment" ? ref : null,
    refund_id: dto.entryType === "Refund" ? ref : null,
    created_at: dto.createdAtUtc,
  }
}

export function customerLedgerQuery(customerId: string, limit: number): string {
  return `/api/v1/customers/${encodeURIComponent(customerId)}/ledger?pageNumber=1&pageSize=${clampLedgerLimit(limit)}`
}

export const customersDotnetApi = {
  ledger: async (customerId: string, limit?: number): Promise<CustomerLedgerRow[]> => {
    const page = await dotnetClient.get<{ items: DotnetCustomerLedgerEntryDto[] }>(customerLedgerQuery(customerId, clampLedgerLimit(limit)))
    return page.items.map(toCustomerLedgerRow)
  },
  list: async (filters?: CustomersFilters): Promise<CustomersResponse> => {
    const page = await dotnetClient.get<DotnetPagedCustomers>(customersListQuery(filters))
    return toCustomersResponse(page)
  },
  get: async (id: string): Promise<Customer> => {
    const dto = await dotnetClient.get<DotnetCustomerDto>(`/api/v1/customers/${encodeURIComponent(id)}`)
    return toCustomer(dto)
  },
  create: async (input: CreateCustomerInput): Promise<Customer> => {
    const id = await dotnetClient.post<string>("/api/v1/customers", customerCreateBody(input))
    return customersDotnetApi.get(id)
  },
  update: async (id: string, updates: CustomerUpdateInput): Promise<Customer> => {
    const path = `/api/v1/customers/${encodeURIComponent(id)}`
    const current = await dotnetClient.get<DotnetCustomerDto>(path)
    await dotnetClient.put(path, customerUpdateBody(current, updates))
    return customersDotnetApi.get(id)
  },
}
