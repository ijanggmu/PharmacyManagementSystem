/**
 * Small, deliberately partial cron → English describer for the schedules Hangfire jobs actually use.
 * Returns null for anything it doesn't confidently understand so the UI can fall back to the raw expression.
 * Times are UTC (Hangfire's default).
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const isInt = (s: string) => /^\d+$/.test(s)
const pad = (n: number) => n.toString().padStart(2, "0")

function inRange(s: string, min: number, max: number): number | null {
  if (!isInt(s)) return null
  const n = Number(s)
  return n >= min && n <= max ? n : null
}

/** "N" or "a,b,c" of ints in range; null otherwise. */
function intList(s: string, min: number, max: number): number[] | null {
  const parts = s.split(",")
  const values: number[] = []
  for (const p of parts) {
    const n = inRange(p, min, max)
    if (n === null) return null
    values.push(n)
  }
  return values
}

/** "*\/N" → N (N ≥ 1). */
function step(s: string): number | null {
  const m = /^\*\/(\d+)$/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 ? n : null
}

function plural(n: number, unit: string): string {
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

function describeDays(dow: string): string | null {
  if (dow === "1-5") return "weekdays"
  if (dow === "0,6" || dow === "6,0") return "weekends"
  const days = intList(dow, 0, 7)
  if (!days) return null
  return joinList(days.map((d) => `${DAY_NAMES[d % 7]}s`))
}

export function describeCron(expression: string | null | undefined): string | null {
  if (!expression) return null
  let fields = expression.trim().split(/\s+/)
  // 6-field (with seconds) expressions: only accept when seconds are "0".
  if (fields.length === 6) {
    if (fields[0] !== "0") return null
    fields = fields.slice(1)
  }
  if (fields.length !== 5) return null
  const [min, hour, dom, month, dow] = fields
  if (month !== "*") return null

  const anyDay = dom === "*" && dow === "*"

  if (anyDay && hour === "*") {
    if (min === "*") return "every minute"
    const s = step(min)
    if (s !== null) return plural(s, "minute")
    const m = inRange(min, 0, 59)
    if (m !== null) return m === 0 ? "every hour, on the hour" : `every hour at :${pad(m)}`
    return null
  }

  const m = inRange(min, 0, 59)
  if (m === null) return null

  const hourStep = step(hour)
  if (anyDay && hourStep !== null) {
    return `${plural(hourStep, "hour")}${m === 0 ? "" : ` at :${pad(m)}`}`
  }

  const hours = intList(hour, 0, 23)
  if (!hours) return null
  const times = joinList(hours.map((h) => `${pad(h)}:${pad(m)}`))

  if (anyDay) return `daily at ${times} UTC`

  if (dom === "*") {
    const days = describeDays(dow)
    return days ? `${days} at ${times} UTC` : null
  }

  if (dow === "*") {
    const d = inRange(dom, 1, 31)
    return d !== null ? `monthly on the ${ordinal(d)} at ${times} UTC` : null
  }

  return null
}
