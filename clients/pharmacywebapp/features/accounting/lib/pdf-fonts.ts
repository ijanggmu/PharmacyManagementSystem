/**
 * Devanagari in the PDF exports. jsPDF's built-in fonts only cover WinAnsi, so Nepali names (customers, suppliers,
 * the pharmacy itself) printed as "?". When — and only when — a document contains Devanagari, the export fetches
 * Noto Sans Devanagari (SIL OFL 1.1; a static Regular instance of Google Fonts' build, subset to Latin + Devanagari,
 * served from `public/fonts`) and registers it with jsPDF for the whole document. The ~190 KB font is never part of
 * the JS bundle and is fetched at most once per page load.
 *
 * Limitation: jsPDF draws characters in order without OpenType shaping, so conjuncts and the pre-base vowel sign
 * "ि" are not formed as in the browser — the text is legible, not typeset.
 */

/** Devanagari, Devanagari Extended and Vedic Extensions. */
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/

export const DEVANAGARI_FONT_URL = "/fonts/NotoSansDevanagari-Regular.ttf"
export const DEVANAGARI_FONT_FILE = "NotoSansDevanagari-Regular.ttf"
export const DEVANAGARI_FONT_FAMILY = "NotoSansDevanagari"

/** True when `text` has at least one Devanagari character. */
export function containsDevanagari(text: string | null | undefined): boolean {
  return !!text && DEVANAGARI.test(text)
}

/** True when any of the strings has Devanagari. Non-strings (numbers, nulls) are skipped. */
export function anyDevanagari(values: Iterable<unknown>): boolean {
  for (const value of values) {
    if (typeof value === "string" && containsDevanagari(value)) return true
  }
  return false
}

/** Base64 of the bytes, in chunks so large fonts don't overflow the argument limit of String.fromCharCode. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

let cached: Promise<string | null> | null = null

/**
 * The Devanagari font as base64, fetched on first use and cached. Resolves to null (and forgets the failure, so a
 * later export retries) when the file is missing or the fetch fails — the export then falls back to "?" as before.
 */
export function loadDevanagariFont(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const response = await fetchImpl(DEVANAGARI_FONT_URL)
        if (!response.ok) return null
        return arrayBufferToBase64(await response.arrayBuffer())
      } catch {
        return null
      }
    })().then((font) => {
      if (font === null) cached = null
      return font
    })
  }
  return cached
}

/** For tests: forget the cached font. */
export function resetDevanagariFontCache(): void {
  cached = null
}

/** The slice of the jsPDF API the registration uses. */
export interface PdfFontHost {
  addFileToVFS(fileName: string, data: string): unknown
  addFont(postScriptName: string, id: string, fontStyle: string): unknown
}

/**
 * Registers the font under {@link DEVANAGARI_FONT_FAMILY}. Only a Regular face ships, so it is registered for the
 * bold / italic styles too (autoTable sets those on total and note rows): they print as regular rather than failing.
 */
export function registerDevanagariFont(pdf: PdfFontHost, base64: string): string {
  pdf.addFileToVFS(DEVANAGARI_FONT_FILE, base64)
  for (const style of ["normal", "bold", "italic", "bolditalic"]) {
    pdf.addFont(DEVANAGARI_FONT_FILE, DEVANAGARI_FONT_FAMILY, style)
  }
  return DEVANAGARI_FONT_FAMILY
}
