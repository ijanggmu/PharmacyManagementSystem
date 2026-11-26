import { describe, expect, it } from "vitest"
import { buildTableCsv, csvField, exportAmount, type ExportColumn } from "./table-export"

describe("exportAmount", () => {
  it("turns money strings into numbers and passes numbers through", () => {
    expect(exportAmount("1234.50")).toBe(1234.5)
    expect(exportAmount("-20.00")).toBe(-20)
    expect(exportAmount(12.25)).toBe(12.25)
  })

  it("returns 0 for missing or unparsable values", () => {
    expect(exportAmount(null)).toBe(0)
    expect(exportAmount(undefined)).toBe(0)
    expect(exportAmount("")).toBe(0)
    expect(exportAmount("n/a")).toBe(0)
  })
})

describe("csvField", () => {
  it("leaves plain values unquoted", () => {
    expect(csvField("Paracetamol")).toBe("Paracetamol")
    expect(csvField(12.5)).toBe("12.5")
    expect(csvField(null)).toBe("")
    expect(csvField(undefined)).toBe("")
  })

  it("quotes on comma, quote, CR or LF and doubles embedded quotes", () => {
    expect(csvField("a,b")).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField("line1\nline2")).toBe('"line1\nline2"')
    expect(csvField("line1\rline2")).toBe('"line1\rline2"')
  })

  it("prefixes ' to text that would start a formula", () => {
    expect(csvField("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)")
    expect(csvField("+cmd")).toBe("'+cmd")
    expect(csvField("-2+3")).toBe("'-2+3")
    expect(csvField("@foo")).toBe("'@foo")
    expect(csvField("\tx")).toBe("'\tx")
    expect(csvField("\rx")).toBe("\"'\rx\"")
    expect(csvField('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"')
  })

  it("leaves numbers and plain numeric text alone so negatives stay numeric", () => {
    expect(csvField(-50)).toBe("-50")
    expect(csvField(-0.5)).toBe("-0.5")
    expect(csvField("-50.00")).toBe("-50.00")
    expect(csvField("+12")).toBe("+12")
  })
})

describe("buildTableCsv", () => {
  it("writes the header row then one CRLF line per row", () => {
    const columns: ExportColumn<{ name: string; amount: number }>[] = [
      { header: "Name", value: (r) => r.name },
      { header: "Amount", value: (r) => r.amount },
    ]
    const csv = buildTableCsv(
      [
        { name: "Ram, Shyam", amount: -10 },
        { name: "=evil()", amount: 5 },
      ],
      columns
    )
    expect(csv).toBe('Name,Amount\r\n"Ram, Shyam",-10\r\n\'=evil(),5')
  })
})
