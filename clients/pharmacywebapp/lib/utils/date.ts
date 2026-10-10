export function formatLocalDateYmd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function parseYmdAsLocalDate(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map((value) => Number(value))
  return new Date(year, (month || 1) - 1, day || 1)
}
