import NepaliDate from "nepali-date-converter"

export const BS_MONTH_NAMES_EN = [
  "Baishakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const

export function getBsDaysInMonth(year: number, month0: number): number {
  let days = 0
  for (let day = 1; day <= 32; day++) {
    try {
      const nd = new NepaliDate(year, month0, day)
      if (nd.getDate() === day && nd.getMonth() === month0 && nd.getYear() === year) {
        days = day
      }
    } catch {
      break
    }
  }
  return days || 30
}
