import { describe, expect, it } from "vitest"
import {
  dateCell,
  integerCell,
  normalizeHeader,
  numberCell,
  rowsFromMatrix,
  templateSheets,
  type ImportColumn,
} from "./spreadsheet"

const COLUMNS: ImportColumn[] = [
  { key: "name", label: "Name", required: true, help: "" },
  { key: "pan", label: "PAN / VAT no", help: "", aliases: ["vat"] },
  { key: "opening_balance", label: "Opening balance", help: "" },
]

describe("normalizeHeader", () => {
  it("ignores case, punctuation, units and required marks", () => {
    expect(normalizeHeader("Opening Balance (Rs)*")).toBe("opening_balance")
    expect(normalizeHeader("  PAN / VAT no ")).toBe("pan_vat_no")
    expect(normalizeHeader("credit-days")).toBe("credit_days")
  })
})

describe("rowsFromMatrix", () => {
  it("maps headers by label, key or alias and keeps the sheet's row numbers", () => {
    const sheet = rowsFromMatrix(
      [
        [],
        ["name", "VAT", "Opening Balance (Rs)", "Notes"],
        ["Ram", "301234567", "1,200"],
        ["", "", ""],
        ["Sita", "", ""],
      ],
      COLUMNS,
    )
    expect(sheet.missingColumns).toEqual([])
    expect(sheet.unknownHeaders).toEqual(["Notes"])
    expect(sheet.rows).toEqual([
      { rowNumber: 3, cells: { name: "Ram", pan: "301234567", opening_balance: "1,200" } },
      { rowNumber: 5, cells: { name: "Sita", pan: "", opening_balance: "" } },
    ])
  })

  it("reports required columns missing from the header", () => {
    expect(rowsFromMatrix([["PAN"], ["1"]], COLUMNS).missingColumns).toEqual(["Name"])
    expect(rowsFromMatrix([], COLUMNS).missingColumns).toEqual(["Name"])
  })
})

describe("cell parsers", () => {
  it("reads rupee amounts with separators, prefixes and accounting negatives", () => {
    expect(numberCell("1,250.50", "Amount")).toEqual({ value: 1250.5, error: null })
    expect(numberCell("Rs. 300", "Amount").value).toBe(300)
    expect(numberCell("(300)", "Amount").value).toBe(-300)
    expect(numberCell("-12", "Amount").value).toBe(-12)
    expect(numberCell("", "Amount")).toEqual({ value: undefined, error: null })
    expect(numberCell("abc", "Amount").error).toContain("not a number")
  })

  it("wants whole numbers for counts", () => {
    expect(integerCell("30", "Credit days").value).toBe(30)
    expect(integerCell("2.5", "Credit days").error).toContain("whole number")
  })

  it("normalizes dates and rejects ambiguous ones", () => {
    expect(dateCell("2026-7-16", "As of").value).toBe("2026-07-16")
    expect(dateCell("16/07/2026", "As of").value).toBe("2026-07-16")
    expect(dateCell("03/04/2026", "As of").error).toContain("ambiguous")
  })
})

describe("templateSheets", () => {
  it("puts the data sheet first and describes every column on the Instructions sheet", () => {
    const [data, instructions] = templateSheets(COLUMNS, [["Ram", "", 0]], ["Keep the header row."])
    expect(data.rows[0]).toEqual(["Name", "PAN / VAT no", "Opening balance"])
    expect(instructions.name).toBe("Instructions")
    expect(instructions.rows.map((r) => r[0])).toEqual(
      expect.arrayContaining(["Name", "PAN / VAT no", "Opening balance", "Keep the header row."]),
    )
    expect(instructions.rows.find((r) => r[0] === "Name")?.[1]).toBe("Yes")
  })
})
