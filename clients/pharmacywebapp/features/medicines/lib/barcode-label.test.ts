import { describe, expect, it } from "vitest"
import { barcodeSymbology, ean13CheckDigit, isValidEan13 } from "./barcode-label"

describe("EAN-13", () => {
  it("computes the GS1 check digit", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1)
    expect(ean13CheckDigit("590123412345")).toBe(7)
    expect(ean13CheckDigit("200000000000")).toBe(8)
  })

  it("accepts only 13 digits with a correct check digit", () => {
    expect(isValidEan13("4006381333931")).toBe(true)
    expect(isValidEan13("4006381333932")).toBe(false)
    expect(isValidEan13("400638133393")).toBe(false)
    expect(isValidEan13("40063813339a1")).toBe(false)
  })
})

describe("barcodeSymbology", () => {
  it("draws valid EAN-13 codes as EAN-13 and anything else as Code 128", () => {
    expect(barcodeSymbology("2000000000008")).toBe("EAN13")
    expect(barcodeSymbology("2000000000009")).toBe("CODE128")
    expect(barcodeSymbology("PCM-500-TAB")).toBe("CODE128")
  })
})
