import JsBarcode from "jsbarcode"
import { escapeHtml } from "@/features/accounting/lib/html-escape"

export type BarcodeSymbology = "EAN13" | "CODE128"

/** Mod-10 check digit over 12 digits, weights 1,3,1,3… from the left (GS1 EAN-13). */
export function ean13CheckDigit(twelveDigits: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = twelveDigits.charCodeAt(i) - 48
    sum += i % 2 === 0 ? digit : digit * 3
  }
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12])
}

/** EAN-13 when the code is a valid EAN-13 (generated or a manufacturer's), else Code 128, which encodes any text. */
export function barcodeSymbology(code: string): BarcodeSymbology {
  return isValidEan13(code) ? "EAN13" : "CODE128"
}

/** SVG markup for a barcode, or null when it can't be encoded. Browser-only. */
export function barcodeSvg(code: string, options: { height?: number; width?: number; fontSize?: number } = {}): string | null {
  const value = code.trim()
  if (!value || typeof document === "undefined") return null
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  try {
    JsBarcode(svg, value, {
      format: barcodeSymbology(value),
      height: options.height ?? 40,
      width: options.width ?? 1.6,
      fontSize: options.fontSize ?? 12,
      margin: 0,
      displayValue: true,
    })
  } catch {
    return null
  }
  return svg.outerHTML
}

export interface BarcodeLabel {
  name: string
  strength?: string | null
  /** Selling price, already formatted with currency (e.g. "Rs. 25.00"). */
  price?: string | null
  barcode: string
}

/**
 * A printable sheet of shelf/pack labels: `copies` of each label in a grid of 50 × 25 mm cells,
 * which fits common A4 label sheets and 50 mm thermal label rolls alike.
 */
export function buildBarcodeLabelsHtml(labels: BarcodeLabel[], copies: number): string | null {
  const count = Math.max(1, Math.min(500, Math.floor(copies)))
  const cells: string[] = []
  for (const label of labels) {
    const svg = barcodeSvg(label.barcode, { height: 34, width: 1.4, fontSize: 11 })
    if (!svg) continue
    const title = [label.name, label.strength].filter(Boolean).join(" ")
    const cell = `<div class="label"><div class="name">${escapeHtml(title)}</div>${svg}${
      label.price ? `<div class="price">${escapeHtml(label.price)}</div>` : ""
    }</div>`
    for (let i = 0; i < count; i++) cells.push(cell)
  }
  if (cells.length === 0) return null

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Barcode labels</title>
<style>
  @page { margin: 5mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .sheet { display: flex; flex-wrap: wrap; gap: 2mm; }
  .label { width: 50mm; height: 25mm; padding: 1mm 2mm; border: 0.2mm dashed #bbb; display: flex; flex-direction: column;
           align-items: center; justify-content: center; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .label svg { max-width: 100%; height: auto; }
  .name { font-size: 8pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .price { font-size: 8pt; font-weight: 700; }
  @media print { .label { border-color: transparent; } }
</style>
</head>
<body><div class="sheet">${cells.join("")}</div></body>
</html>`
}
