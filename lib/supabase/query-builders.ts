/**
 * Pure Supabase query helpers (no browser client).
 * Safe to import from Route Handlers, services, and client-side API wrappers.
 */

export function buildSearchFilter(query: any, searchTerm: string, searchFields: string[]) {
  if (!searchTerm || searchFields.length === 0) {
    return query
  }

  const searchConditions = searchFields
    .map((field) => `${field}.ilike.%${searchTerm}%`)
    .join(",")

  return query.or(searchConditions)
}

export function applyPagination(query: any, page: number = 1, limit: number = 10) {
  const offset = (page - 1) * limit
  return query.range(offset, offset + limit - 1)
}

export function applySorting(query: any, sortBy?: string, sortOrder: "asc" | "desc" = "desc") {
  if (!sortBy) {
    return query
  }
  return query.order(sortBy, { ascending: sortOrder === "asc" })
}
