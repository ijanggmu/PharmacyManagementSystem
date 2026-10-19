import type { GoLiveSection } from "./go-live-workbook"
import type { GoLiveProblem } from "./go-live-run"

/** Rows shown per page of a problem list. */
export const PROBLEM_ROWS_PER_PAGE = 20

export interface ProblemGroup {
  key: string
  section: GoLiveSection
  rowNumber: number
  label?: string
  items: GoLiveProblem[]
}

const SECTION_ORDER: GoLiveSection[] = ["stock", "suppliers", "customers", "balances"]

/** One entry per sheet row, in sheet order then row order, so a row with three problems is fixed in one place. */
export function groupProblems(problems: GoLiveProblem[]): ProblemGroup[] {
  const groups = new Map<string, ProblemGroup>()
  for (const p of problems) {
    const key = `${p.section}:${p.rowNumber}`
    const group = groups.get(key) ?? { key, section: p.section, rowNumber: p.rowNumber, label: p.label, items: [] }
    group.items.push(p)
    groups.set(key, group)
  }
  return [...groups.values()].sort(
    (a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || a.rowNumber - b.rowNumber,
  )
}

/** The groups on one page (1-based), with the page clamped to the last one when the list got shorter. */
export function problemPage<T>(groups: T[], page: number, perPage = PROBLEM_ROWS_PER_PAGE): { page: number; totalPages: number; start: number; items: T[] } {
  const totalPages = Math.max(1, Math.ceil(groups.length / perPage))
  const current = Math.min(Math.max(1, page), totalPages)
  const start = (current - 1) * perPage
  return { page: current, totalPages, start, items: groups.slice(start, start + perPage) }
}
