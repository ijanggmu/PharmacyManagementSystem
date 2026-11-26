import { afterEach, describe, expect, it, vi } from "vitest"
import { buildCsv, csvCell, downloadCsv } from "./csv"

describe("csvCell", () => {
  it("always quotes and doubles embedded quotes", () => {
    expect(csvCell("Cash")).toBe('"Cash"')
    expect(csvCell('a "b", c\r\nd')).toBe('"a ""b"", c\r\nd"')
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
  })

  it("prefixes ' to text that would start a formula", () => {
    expect(csvCell("=1+1")).toBe("\"'=1+1\"")
    expect(csvCell("+x")).toBe("\"'+x\"")
    expect(csvCell("-x")).toBe("\"'-x\"")
    expect(csvCell("@x")).toBe("\"'@x\"")
    expect(csvCell("\tx")).toBe("\"'\tx\"")
    expect(csvCell("\rx")).toBe("\"'\rx\"")
  })

  it("leaves numbers and plain numeric text alone", () => {
    expect(csvCell(-1234.5)).toBe('"-1234.5"')
    expect(csvCell("-1234.50")).toBe('"-1234.50"')
    expect(csvCell("-1,234.50")).toBe('"-1,234.50"')
  })
})

describe("buildCsv", () => {
  it("joins header and rows with newlines", () => {
    expect(buildCsv(["A", "B"], [["x", 1], ["=y", -2]])).toBe('"A","B"\n"x","1"\n"\'=y","-2"')
  })
})

describe("downloadCsv", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("revokes the object URL only after the click, on a later tick", () => {
    vi.useFakeTimers()
    const events: string[] = []
    const anchor = { href: "", download: "", click: () => events.push("click"), remove: () => events.push("remove") }
    vi.stubGlobal("document", {
      createElement: () => anchor,
      body: { appendChild: () => events.push("append") },
    })
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:test",
      revokeObjectURL: (url: string) => events.push(`revoke:${url}`),
    })

    downloadCsv("report.csv", ["A"], [["1"]])
    expect(anchor.download).toBe("report.csv")
    expect(events).toEqual(["append", "click", "remove"])

    vi.runAllTimers()
    expect(events).toEqual(["append", "click", "remove", "revoke:blob:test"])
  })
})
