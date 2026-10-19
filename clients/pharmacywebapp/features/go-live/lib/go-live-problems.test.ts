import { describe, expect, it } from "vitest"
import { groupProblems, problemPage } from "./go-live-problems"
import type { GoLiveProblem } from "./go-live-run"

const p = (section: GoLiveProblem["section"], rowNumber: number, field: string, label?: string): GoLiveProblem => ({
  section,
  rowNumber,
  field,
  message: `${field} problem`,
  label,
})

describe("groupProblems", () => {
  it("gathers a row's problems into one entry, medicines first, rows in order", () => {
    const groups = groupProblems([
      p("suppliers", 3, "name"),
      p("stock", 9, "selling_price", "Zinc"),
      p("stock", 4, "quantity", "Cetamol"),
      p("stock", 9, "vat", "Zinc"),
    ])
    expect(groups.map((g) => g.key)).toEqual(["stock:4", "stock:9", "suppliers:3"])
    expect(groups[1]).toMatchObject({ label: "Zinc", items: [{ field: "selling_price" }, { field: "vat" }] })
  })
})

describe("problemPage", () => {
  const rows = Array.from({ length: 45 }, (_, i) => i)

  it("slices 20 rows a page", () => {
    expect(problemPage(rows, 1)).toMatchObject({ page: 1, totalPages: 3, start: 0 })
    expect(problemPage(rows, 3).items).toEqual([40, 41, 42, 43, 44])
  })

  it("falls back to the last page when the list got shorter", () => {
    expect(problemPage(rows.slice(0, 5), 3)).toMatchObject({ page: 1, totalPages: 1, items: [0, 1, 2, 3, 4] })
    expect(problemPage([], 2)).toMatchObject({ page: 1, totalPages: 1, items: [] })
  })
})
