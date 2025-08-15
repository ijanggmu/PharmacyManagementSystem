// Currency formatting
export function formatCurrency(amount: string | number, currency = "USD"): string {
  const numAmount = typeof amount === "string" ? Number.parseFloat(amount) : amount

  if (isNaN(numAmount)) return "$0.00"

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numAmount)
}

// Date formatting
export function formatDate(date: string | Date, format: "short" | "long" | "relative" = "short"): string {
  const dateObj = typeof date === "string" ? new Date(date) : date

  if (isNaN(dateObj.getTime())) return "Invalid Date"

  switch (format) {
    case "short":
      return dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    case "long":
      return dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    case "relative":
      return formatRelativeTime(dateObj)
    default:
      return dateObj.toLocaleDateString()
  }
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return "Just now"
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`
  return `${Math.floor(diffInSeconds / 31536000)} years ago`
}

// Number formatting
export function formatNumber(num: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat("en-US", options).format(num)
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

// Text formatting
export function truncateText(text: string, maxLength: number, suffix = "..."): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - suffix.length) + suffix
}

export function capitalizeFirst(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

export function capitalizeWords(text: string): string {
  if (!text) return text
  return text
    .split(" ")
    .map((word) => capitalizeFirst(word))
    .join(" ")
}

// Phone number formatting
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "")

  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }

  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }

  return phone
}

// File size formatting
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

// Medicine form display names
export function formatMedicineForm(form: string): string {
  const formMap: Record<string, string> = {
    tablet: "Tablet",
    capsule: "Capsule",
    syrup: "Syrup",
    injection: "Injection",
    cream: "Cream",
    drops: "Drops",
    inhaler: "Inhaler",
    patch: "Patch",
  }

  return formMap[form] || capitalizeFirst(form)
}

// Status formatting
export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => capitalizeFirst(word))
    .join(" ")
}

// Prescription number formatting
export function formatPrescriptionNumber(number: string): string {
  // Format as RX-YYYYMMDD-XXXX
  if (number.length >= 8) {
    return `RX-${number.slice(0, 8)}-${number.slice(8)}`
  }
  return number
}

// Barcode formatting
export function formatBarcode(barcode: string): string {
  // Format UPC-A barcode as XXX-XXXX-XXXX-X
  if (barcode.length === 12) {
    return `${barcode.slice(0, 3)}-${barcode.slice(3, 7)}-${barcode.slice(7, 11)}-${barcode.slice(11)}`
  }
  return barcode
}
