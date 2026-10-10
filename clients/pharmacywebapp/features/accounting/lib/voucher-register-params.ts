/**
 * Voucher register filters + paging <-> URL query string. Pure, so the register can keep its state in
 * the URL (shareable, survives reload/back) and the mapping is unit-tested.
 *
 * Each register instance uses its own key prefix ("vr" for the register, "mj" for manual journals) so
 * the two tabs on the same page don't overwrite each other's filters. Default values are omitted
 * from the URL.
 */

import {
  DEFAULT_VOUCHER_PAGE_SIZE,
  isVoucherSourceFilter,
  isVoucherStatusFilter,
  normalizeVoucherPage,
  VOUCHER_PAGE_SIZES,
  type VoucherListParams,
  type VoucherSourceFilter,
  type VoucherStatusFilter,
} from "@/lib/api/accounting-api"

export type StatusOption = "all" | VoucherStatusFilter
export type SourceOption = "all" | VoucherSourceFilter

export interface VoucherRegisterState {
  page: number
  pageSize: number
  status: StatusOption
  /** "all" or a voucher type value. */
  voucherType: string
  source: SourceOption
  search: string
}

export interface VoucherRegisterDefaults {
  source: SourceOption
}

const KEYS = ["page", "size", "status", "type", "source", "q"] as const
type Key = (typeof KEYS)[number]
const VOUCHER_TYPE_PATTERN = /^[a-z0-9_]{1,64}$/i

const key = (prefix: string, k: Key) => `${prefix}${k.charAt(0).toUpperCase()}${k.slice(1)}`

function intParam(value: string | null): number | undefined {
  if (value == null || !/^\d+$/.test(value)) return undefined
  return Number(value)
}

export function defaultVoucherRegisterState(defaults: VoucherRegisterDefaults): VoucherRegisterState {
  return { page: 1, pageSize: DEFAULT_VOUCHER_PAGE_SIZE, status: "all", voucherType: "all", source: defaults.source, search: "" }
}

/** Reads the state from a query string; anything invalid falls back to its default. */
export function readVoucherRegisterState(
  params: URLSearchParams,
  prefix: string,
  defaults: VoucherRegisterDefaults
): VoucherRegisterState {
  const base = defaultVoucherRegisterState(defaults)
  const rawSize = intParam(params.get(key(prefix, "size")))
  const pageSize = rawSize !== undefined && (VOUCHER_PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : base.pageSize
  const { pageNumber } = normalizeVoucherPage(intParam(params.get(key(prefix, "page"))), pageSize)
  const status = params.get(key(prefix, "status"))
  const source = params.get(key(prefix, "source"))
  const type = params.get(key(prefix, "type"))
  return {
    page: pageNumber,
    pageSize,
    status: isVoucherStatusFilter(status) ? status : "all",
    voucherType: type && VOUCHER_TYPE_PATTERN.test(type) ? type : "all",
    source: source === "all" ? "all" : isVoucherSourceFilter(source) ? source : base.source,
    search: (params.get(key(prefix, "q")) ?? "").slice(0, 128),
  }
}

/** Writes the state into `search` (keeping unrelated params) and returns the new query string, without "?". */
export function writeVoucherRegisterState(
  search: string,
  prefix: string,
  state: VoucherRegisterState,
  defaults: VoucherRegisterDefaults
): string {
  const params = new URLSearchParams(search)
  const base = defaultVoucherRegisterState(defaults)
  const values: Record<Key, string | null> = {
    page: state.page > 1 ? String(state.page) : null,
    size: state.pageSize !== base.pageSize ? String(state.pageSize) : null,
    status: state.status !== "all" ? state.status : null,
    type: state.voucherType !== "all" ? state.voucherType : null,
    source: state.source !== base.source ? state.source : null,
    q: state.search.trim() ? state.search.trim() : null,
  }
  for (const k of KEYS) {
    const v = values[k]
    if (v == null) params.delete(key(prefix, k))
    else params.set(key(prefix, k), v)
  }
  return params.toString()
}

/** Applies a change; any filter change (not page) goes back to page 1. */
export function patchVoucherRegisterState(state: VoucherRegisterState, patch: Partial<VoucherRegisterState>): VoucherRegisterState {
  const next = { ...state, ...patch }
  const filterChanged = (Object.keys(patch) as (keyof VoucherRegisterState)[]).some((k) => k !== "page" && patch[k] !== state[k])
  if (filterChanged && patch.page === undefined) next.page = 1
  return next
}

/** The API request for the register state and period. */
export function toVoucherListParams(
  state: VoucherRegisterState,
  period: { from: string; to: string; branchId?: string }
): VoucherListParams {
  return {
    dateFrom: period.from,
    dateTo: period.to,
    branchId: period.branchId,
    status: state.status === "all" ? undefined : state.status,
    voucherType: state.voucherType === "all" ? undefined : state.voucherType,
    source: state.source === "all" ? undefined : state.source,
    search: state.search.trim() || undefined,
    page: state.page,
    pageSize: state.pageSize,
  }
}
