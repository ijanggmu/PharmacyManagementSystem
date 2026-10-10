import { describe, expect, it } from "vitest"
import { escapeCssString, escapeHtml } from "./html-escape"

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
    )
  })

  it("escapes ampersands first so entities are not double-decoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;")
  })

  it("returns empty string for null/undefined and stringifies numbers", () => {
    expect(escapeHtml(null)).toBe("")
    expect(escapeHtml(undefined)).toBe("")
    expect(escapeHtml(42)).toBe("42")
  })

  it("neutralises attribute breakouts", () => {
    expect(escapeHtml(`" onmouseover="alert(1)`)).not.toContain('"')
  })
})

describe("escapeCssString", () => {
  it("escapes quotes, backslashes, newlines and <", () => {
    expect(escapeCssString(`a"b'c\\d\ne</style>`)).toBe(`a\\"b\\'c\\\\d e\\3C /style>`)
  })
})
