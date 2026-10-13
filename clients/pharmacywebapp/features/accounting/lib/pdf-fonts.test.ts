import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DEVANAGARI_FONT_FAMILY,
  DEVANAGARI_FONT_FILE,
  DEVANAGARI_FONT_URL,
  anyDevanagari,
  arrayBufferToBase64,
  containsDevanagari,
  loadDevanagariFont,
  registerDevanagariFont,
  resetDevanagariFontCache,
} from "./pdf-fonts"

afterEach(() => resetDevanagariFontCache())

describe("Devanagari detection", () => {
  it("finds Devanagari letters, vowel signs and digits", () => {
    expect(containsDevanagari("राम Traders")).toBe(true)
    expect(containsDevanagari("काठमाडौं")).toBe(true)
    expect(containsDevanagari("२०८३")).toBe(true)
    expect(containsDevanagari("ि")).toBe(true)
  })

  it("ignores Latin, typographic punctuation and empty values", () => {
    expect(containsDevanagari("Himal Pharmacy – 1,23,456.00 · BS")).toBe(false)
    expect(containsDevanagari("Café ₹ €")).toBe(false)
    expect(containsDevanagari("")).toBe(false)
    expect(containsDevanagari(null)).toBe(false)
    expect(containsDevanagari(undefined)).toBe(false)
  })

  it("scans mixed values, skipping non-strings", () => {
    expect(anyDevanagari(["Sales", 1200, null, "नेपाल"])).toBe(true)
    expect(anyDevanagari(["Sales", 1200, null, undefined])).toBe(false)
    expect(anyDevanagari([])).toBe(false)
  })
})

describe("font loading", () => {
  const bytes = new Uint8Array([0, 1, 0, 0, 255, 128, 65])

  it("encodes bytes as base64, also past the chunk size", () => {
    expect(arrayBufferToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString("base64"))
    const big = new Uint8Array(0x8000 * 2 + 5).map((_, i) => i % 251)
    expect(arrayBufferToBase64(big.buffer)).toBe(Buffer.from(big).toString("base64"))
  })

  it("fetches the font once and caches it", async () => {
    const fetchMock = vi.fn(async () => new Response(bytes))
    const first = await loadDevanagariFont(fetchMock as unknown as typeof fetch)
    const second = await loadDevanagariFont(fetchMock as unknown as typeof fetch)
    expect(first).toBe(Buffer.from(bytes).toString("base64"))
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(DEVANAGARI_FONT_URL)
  })

  it("resolves null when the font is missing, and retries next time", async () => {
    const missing = vi.fn(async () => new Response("not found", { status: 404 }))
    expect(await loadDevanagariFont(missing as unknown as typeof fetch)).toBeNull()
    const offline = vi.fn(async () => {
      throw new TypeError("network")
    })
    expect(await loadDevanagariFont(offline as unknown as typeof fetch)).toBeNull()
    const ok = vi.fn(async () => new Response(bytes))
    expect(await loadDevanagariFont(ok as unknown as typeof fetch)).not.toBeNull()
    expect(missing).toHaveBeenCalledTimes(1)
    expect(offline).toHaveBeenCalledTimes(1)
  })

  it("registers the regular face for every style", () => {
    const pdf = { addFileToVFS: vi.fn(), addFont: vi.fn() }
    expect(registerDevanagariFont(pdf, "AAAA")).toBe(DEVANAGARI_FONT_FAMILY)
    expect(pdf.addFileToVFS).toHaveBeenCalledWith(DEVANAGARI_FONT_FILE, "AAAA")
    expect(pdf.addFont.mock.calls.map((c) => c[2])).toEqual(["normal", "bold", "italic", "bolditalic"])
    expect(pdf.addFont).toHaveBeenCalledWith(DEVANAGARI_FONT_FILE, DEVANAGARI_FONT_FAMILY, "normal")
  })
})
