/**
 * Customer calls, switchable per backend target (CUSTOMERS). The legacy path keeps /api/customers.
 * The dotnet path uses the Customers module's /api/v1/customers and maps its single Name field to the
 * UI's first_name/last_name pair.
 *
 * Medical notes (allergies, chronic_conditions, current_medications) are stored on the .NET customer as
 * string lists; allergies drive the checkout allergy warning.
 * Not carried over to .NET (the CustomerDto has no field for them): date_of_birth, insurance_provider,
 * insurance_number. The per-customer prescription and sales stubs are also empty on this path, so the
 * prescriptions count and total-spent columns read 0.
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
  /** Customer number on the card / in its QR, e.g. "C-000123". */
  code?: string | null
  /** Most the customer may owe on account; null = no limit. */
  creditLimit?: number | null
  /** creditLimit − currentBalance; null when there is no limit. */
  availableCredit?: number | null
  /** Payment terms in days; null = none. */
  creditDays?: number | null
  /** Loyalty programme member. */
  isMember?: boolean
  /** Agreed to automated SMS (refill / automatic dues reminders). */
  smsConsent?: boolean
  loyaltyPoints?: number
  /** Free-text substance names; drive the checkout allergy warning. */
  allergies?: string[] | null
  chronicConditions?: string[] | null
  currentMedications?: string[] | null
}

/** CustomerLoyaltyDto: membership, points and recent movements. */
export interface DotnetCustomerLoyalty {
  customerId: string
  isMember: boolean
  memberSinceUtc: string | null
  points: number
  pointsValue: number
  entries: { id: string; createdAtUtc: string; entryType: string; points: number; balanceAfter: number; description: string | null; saleId: string | null }[]
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
  /** undefined keeps the stored limit; null removes it; a number sets it. */
  credit_limit?: number | null
  /** Payment terms in days. undefined keeps the stored terms; null removes them; a number sets them. */
  credit_days?: number | null
  /** undefined keeps the stored membership. */
  is_member?: boolean
  /** undefined keeps the stored SMS consent. */
  sms_consent?: boolean
  /** undefined keeps the stored list; an empty array clears it. */
  allergies?: string[]
  chronic_conditions?: string[]
  current_medications?: string[]
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

/** Trimmed, non-empty entries with case-insensitive duplicates dropped (the server normalizes the same way). */
export function cleanList(values: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values ?? []) {
    const value = raw.trim()
    const key = value.toLowerCase()
    if (value === "" || seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
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
    is_active: dto.isActive,
    created_at: dto.createdAtUtc,
    code: dto.code ?? null,
    current_balance: dto.currentBalance,
    credit_limit: dto.creditLimit ?? null,
    available_credit: dto.availableCredit ?? null,
    credit_days: dto.creditDays ?? null,
    is_member: dto.isMember ?? false,
    sms_consent: dto.smsConsent ?? false,
    loyalty_points: dto.loyaltyPoints ?? 0,
    allergies: dto.allergies ?? [],
    chronic_conditions: dto.chronicConditions ?? [],
    current_medications: dto.currentMedications ?? [],
    prescriptions: [],
    sales: [],
  }
}

/** Server cap on GET /customers pageSize (SearchCustomersQueryValidator). Larger requests are rejected with 400. */
export const CUSTOMERS_MAX_PAGE_SIZE = 200

/**
 * UI sort keys mapped to the values SearchCustomersQueryHandler recognises (name, balance, created).
 * The .NET customer has a single Name, so first/last name both sort by it.
 */
const CUSTOMER_SORT: Record<string, string> = {
  name: "name",
  first_name: "name",
  last_name: "name",
  balance: "balance",
  current_balance: "balance",
  created: "created",
  created_at: "created",
  createdatutc: "created",
}

/** The active/inactive filter from whichever of activity, a single status or a single legacy status is set. */
function customerActivityFilter(filters?: CustomersFilters): "active" | "inactive" | undefined {
  if (filters?.activity) return filters.activity
  if (filters?.status === "active" || filters?.status === "inactive") return filters.status
  if (filters?.statuses?.length === 1) return filters.statuses[0]
  return undefined
}

export function customersListQuery(filters?: CustomersFilters): string {
  const p = new URLSearchParams()
  if (filters?.search?.trim()) p.set("search", filters.search.trim())
  if (filters?.page != null) p.set("pageNumber", String(Math.max(1, Math.trunc(filters.page))))
  // Never ask for more than the server accepts; callers that want more rows go through listAll.
  if (filters?.limit != null) p.set("pageSize", String(Math.min(Math.max(Math.trunc(filters.limit), 1), CUSTOMERS_MAX_PAGE_SIZE)))
  const sortBy = filters?.sortBy ? CUSTOMER_SORT[filters.sortBy.toLowerCase()] : undefined
  if (sortBy) p.set("sortBy", sortBy)
  if (filters?.sortOrder) p.set("sortDir", filters.sortOrder)
  const activity = customerActivityFilter(filters)
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
    creditLimit: input.credit_limit ?? null,
    creditDays: input.credit_days ?? null,
    isMember: input.is_member === true,
    smsConsent: input.sms_consent === true,
    allergies: cleanList(input.allergies),
    chronicConditions: cleanList(input.chronic_conditions),
    currentMedications: cleanList(input.current_medications),
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
    // The API keeps the stored limit when creditLimit is null, so removing it is an explicit flag.
    creditLimit: updates.credit_limit ?? null,
    clearCreditLimit: updates.credit_limit === null,
    // Same convention for the payment terms.
    creditDays: updates.credit_days ?? null,
    clearCreditDays: updates.credit_days === null,
    isMember: updates.is_member ?? null,
    smsConsent: updates.sms_consent ?? null,
    // null keeps the stored list on the server; an array (even empty) replaces it.
    allergies: updates.allergies !== undefined ? cleanList(updates.allergies) : null,
    chronicConditions: updates.chronic_conditions !== undefined ? cleanList(updates.chronic_conditions) : null,
    currentMedications: updates.current_medications !== undefined ? cleanList(updates.current_medications) : null,
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
  /** INV-… on a sale, CN-… on a refund, RCP-… on a customer payment; null on older entries. */
  documentNumber?: string | null
  /** True on a payment that has been voided (a reversing CustomerPaymentVoid entry references it). */
  isVoided?: boolean
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
  debit: number
  credit: number
  branch_id: string | null
  /** .NET reference type; "CustomerPaymentVoid" on the entry that voids a payment. */
  reference_type: string | null
  /** A payment that has been voided. */
  is_voided: boolean
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
 * payment_id or refund_id by entry type. reference_number is the document number (INV-/CN-/RCP-), null on
 * entries recorded before numbering.
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
    reference_number: dto.documentNumber ?? null,
    sale_id: dto.entryType === "Sale" ? ref : null,
    payment_id: dto.entryType === "Payment" ? ref : null,
    refund_id: dto.entryType === "Refund" ? ref : null,
    created_at: dto.createdAtUtc,
    debit: dto.debitAmount,
    credit: dto.creditAmount,
    branch_id: dto.branchId,
    reference_type: dto.referenceType ?? null,
    is_voided: dto.isVoided === true,
  }
}

export function customerLedgerQuery(customerId: string, limit: number, page = 1, branchId?: string | null): string {
  const base = `/api/v1/customers/${encodeURIComponent(customerId)}/ledger?pageNumber=${Math.max(1, Math.trunc(page))}&pageSize=${clampLedgerLimit(limit)}`
  // With a branch the API recomputes the running balance from that branch's entries only.
  return branchId ? `${base}&branchId=${encodeURIComponent(branchId)}` : base
}

export interface CustomerLedgerPage {
  items: CustomerLedgerRow[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** CustomerSummaryDto: server-side totals for the customer profile (completed sales only, every branch the
 * caller may view; prescriptions on file). */
export interface CustomerSummary {
  customerId: string
  purchaseCount: number
  totalSpent: number
  prescriptionCount: number
}

export const customersDotnetApi = {
  summary: async (customerId: string): Promise<CustomerSummary> =>
    dotnetClient.get<CustomerSummary>(`/api/v1/customers/${encodeURIComponent(customerId)}/summary`),
  ledger: async (customerId: string, limit?: number): Promise<CustomerLedgerRow[]> => {
    const page = await dotnetClient.get<{ items: DotnetCustomerLedgerEntryDto[] }>(customerLedgerQuery(customerId, clampLedgerLimit(limit)))
    return page.items.map(toCustomerLedgerRow)
  },
  /** Paged variant of `ledger`, used wherever a page control is shown over the ledger entries. */
  ledgerPage: async (customerId: string, page: number, limit?: number, branchId?: string | null): Promise<CustomerLedgerPage> => {
    const result = await dotnetClient.get<{
      items: DotnetCustomerLedgerEntryDto[]
      pageNumber: number
      pageSize: number
      totalCount: number
      totalPages: number
    }>(customerLedgerQuery(customerId, clampLedgerLimit(limit), page, branchId))
    return {
      items: result.items.map(toCustomerLedgerRow),
      pageNumber: result.pageNumber,
      pageSize: result.pageSize,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
    }
  },
  /** One page. A limit above the server cap is served by paging through listAll and trimming to the limit. */
  list: async (filters?: CustomersFilters): Promise<CustomersResponse> => {
    if (filters?.limit != null && filters.limit > CUSTOMERS_MAX_PAGE_SIZE) {
      const all = await customersDotnetApi.listAll(filters, filters.limit)
      return { ...all, data: all.data.slice(0, filters.limit) }
    }
    const page = await dotnetClient.get<DotnetPagedCustomers>(customersListQuery(filters))
    return toCustomersResponse(page)
  },
  /** Every customer matching the filters (up to `max` rows), 200 per request. `page`/`limit` are ignored. */
  listAll: async (filters?: CustomersFilters, max = Number.POSITIVE_INFINITY): Promise<CustomersResponse> => {
    const rows: DotnetCustomerDto[] = []
    let total = 0
    for (let pageNumber = 1; ; pageNumber++) {
      const page = await dotnetClient.get<DotnetPagedCustomers>(
        customersListQuery({ ...filters, page: pageNumber, limit: CUSTOMERS_MAX_PAGE_SIZE }),
      )
      rows.push(...page.items)
      total = page.totalCount
      if (pageNumber >= page.totalPages || page.items.length === 0 || rows.length >= max) break
    }
    return { data: rows.map(toCustomer), total, error: null }
  },
  get: async (id: string): Promise<Customer> => {
    const dto = await dotnetClient.get<DotnetCustomerDto>(`/api/v1/customers/${encodeURIComponent(id)}`)
    return toCustomer(dto)
  },
  loyalty: async (customerId: string): Promise<DotnetCustomerLoyalty> =>
    dotnetClient.get<DotnetCustomerLoyalty>(`/api/v1/customers/${encodeURIComponent(customerId)}/loyalty`),
  /** Adds (positive) or removes (negative) points with a reason; returns the new balance. */
  adjustLoyalty: async (customerId: string, points: number, reason: string): Promise<number> =>
    dotnetClient.post<number>(`/api/v1/customers/${encodeURIComponent(customerId)}/loyalty/adjust`, { customerId, points, reason }),
  /** The customer whose card number this is (case/space-insensitive). Throws a 404 DotnetApiError when unknown. */
  getByCode: async (code: string): Promise<Customer> =>
    toCustomer(await dotnetClient.get<DotnetCustomerDto>(`/api/v1/customers/by-code/${encodeURIComponent(code.trim())}`)),
  create: async (input: CreateCustomerInput): Promise<Customer> => {
    const id = await dotnetClient.post<string>("/api/v1/customers", customerCreateBody(input))
    return customersDotnetApi.get(id)
  },
  /**
   * Moves the customer to the trash. The API refuses (409) while the customer still has an account balance;
   * the error carries the server's message ("… still owes …").
   */
  delete: async (id: string): Promise<void> => {
    await dotnetClient.delete<void>(`/api/v1/customers/${encodeURIComponent(id)}`)
  },
  update: async (id: string, updates: CustomerUpdateInput): Promise<Customer> => {
    const path = `/api/v1/customers/${encodeURIComponent(id)}`
    const current = await dotnetClient.get<DotnetCustomerDto>(path)
    await dotnetClient.put(path, customerUpdateBody(current, updates))
    return customersDotnetApi.get(id)
  },
}
