import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import { mergeSupplierOptions, suppliersDotnetApi, type SupplierOption } from "@/lib/api/suppliers-api"

/** Rows fetched up front; typing searches the server for anything beyond this. */
export const SUPPLIER_OPTIONS_INITIAL_LIMIT = 500
/** Rows per server search. */
export const SUPPLIER_OPTIONS_SEARCH_LIMIT = 50

/**
 * Keys live under supplierKeys.lists(), so every existing "supplier created/updated/deleted"
 * invalidation also refreshes the pickers.
 */
export const supplierOptionKeys = {
  all: () => [...supplierKeys.lists(), "options"] as const,
  list: (includeInactive: boolean, search: string) =>
    [...supplierOptionKeys.all(), { includeInactive, search }] as const,
}

/**
 * What the picker shows: the initial list when there is no search term, else the server matches
 * (falling back to the initial list filtered locally while the first search is in flight).
 */
export function resolveSupplierOptions(
  initial: readonly SupplierOption[] | undefined,
  searched: readonly SupplierOption[] | undefined,
  search: string,
): SupplierOption[] {
  const term = search.trim().toLowerCase()
  if (!term) return mergeSupplierOptions(initial)
  if (searched) return mergeSupplierOptions(searched)
  return mergeSupplierOptions(initial).filter(
    (s) => s.name.toLowerCase().includes(term) || (s.phone ?? "").toLowerCase().includes(term),
  )
}

export interface UseSupplierOptionsArgs {
  /** Server-side search term (debounce it in the caller or use SupplierCombobox's built-in debounce). */
  search?: string
  /** Include deactivated suppliers, e.g. to show a saved choice. Defaults to active only. */
  includeInactive?: boolean
  enabled?: boolean
}

/**
 * Supplier picker data from GET /suppliers/lookup (id, name, phone). Replaces loading the paged
 * supplier list with an oversized `limit`, which the server rejects above 200 rows.
 */
export function useSupplierOptions({ search = "", includeInactive = false, enabled = true }: UseSupplierOptionsArgs = {}) {
  const term = search.trim()

  const initial = useQuery({
    queryKey: supplierOptionKeys.list(includeInactive, ""),
    queryFn: () => suppliersDotnetApi.lookup({ includeInactive, limit: SUPPLIER_OPTIONS_INITIAL_LIMIT }),
    staleTime: 5 * 60 * 1000,
    enabled,
  })

  const searched = useQuery({
    queryKey: supplierOptionKeys.list(includeInactive, term),
    queryFn: () => suppliersDotnetApi.lookup({ includeInactive, search: term, limit: SUPPLIER_OPTIONS_SEARCH_LIMIT }),
    staleTime: 60 * 1000,
    enabled: enabled && term !== "",
    placeholderData: keepPreviousData,
  })

  const error = initial.error ?? (term ? searched.error : null)

  return {
    options: resolveSupplierOptions(initial.data, term ? searched.data : undefined, term),
    /** Every option seen so far, so a chosen supplier keeps its label while the list is narrowed. */
    knownOptions: mergeSupplierOptions(initial.data, searched.data),
    isLoading: initial.isLoading,
    isSearching: term !== "" && searched.isFetching,
    isError: initial.isError || (term !== "" && searched.isError),
    error: error ? stockErrorMessage(error, "Failed to load suppliers") : null,
    /** True when the initial list hit its cap and searching may find more. */
    isTruncated: (initial.data?.length ?? 0) >= SUPPLIER_OPTIONS_INITIAL_LIMIT,
    refetch: () => {
      void initial.refetch()
      if (term) void searched.refetch()
    },
  }
}
