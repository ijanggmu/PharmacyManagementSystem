/**
 * Barcode Utilities
 * Barcode generation and validation
 */

// Barcode generation using Code128 format
export function generateBarcode(data: string): string {
  // This is a simplified implementation
  // For production, use a proper barcode library like jsbarcode
  // Format: Add check digit and format according to Code128 standard
  return data.padStart(12, "0")
}

// Validate barcode format
export function validateBarcode(barcode: string, type: "EAN13" | "UPC" | "CODE128" = "CODE128"): boolean {
  if (!barcode || barcode.length === 0) {
    return false
  }

  switch (type) {
    case "EAN13":
      return /^\d{13}$/.test(barcode)
    case "UPC":
      return /^\d{12}$/.test(barcode)
    case "CODE128":
      return barcode.length >= 1 && barcode.length <= 48
    default:
      return false
  }
}

// Generate EAN-13 barcode with check digit
export function generateEAN13(data: string): string {
  if (data.length !== 12) {
    throw new Error("EAN-13 requires 12 digits")
  }

  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(data[i])
    sum += i % 2 === 0 ? digit : digit * 3
  }

  const checkDigit = (10 - (sum % 10)) % 10
  return data + checkDigit.toString()
}

// Generate UPC-A barcode
export function generateUPCA(data: string): string {
  if (data.length !== 11) {
    throw new Error("UPC-A requires 11 digits")
  }

  let sum = 0
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(data[i])
    sum += i % 2 === 0 ? digit * 3 : digit
  }

  const checkDigit = (10 - (sum % 10)) % 10
  return data + checkDigit.toString()
}

