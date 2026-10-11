export interface Page<T> {
  items: T[]
  /** 1-based page actually shown (clamped into range). */
  page: number
  totalPages: number
  totalItems: number
  perPage: number
  startIndex: number
}

/** Client-side pagination. Out-of-range pages clamp, so a shrinking list never shows an empty page. */
export function paginate<T>(items: readonly T[], page: number, perPage: number): Page<T> {
  const size = Math.max(1, Math.floor(perPage))
  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / size))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  const startIndex = (current - 1) * size
  return {
    items: items.slice(startIndex, startIndex + size),
    page: current,
    totalPages,
    totalItems,
    perPage: size,
    startIndex,
  }
}

/** Case-insensitive "every word appears in one of the fields" search. Empty query matches everything. */
export function matchesQuery(query: string, fields: readonly (string | null | undefined)[]): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fields.filter((f): f is string => typeof f === "string").join(" ").toLowerCase()
  return words.every((w) => haystack.includes(w))
}
