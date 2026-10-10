import { describe, expect, it } from "vitest"
import { describeCron } from "./cron"

describe("describeCron", () => {
  it.each([
    ["* * * * *", "every minute"],
    ["*/5 * * * *", "every 5 minutes"],
    ["*/1 * * * *", "every minute"],
    ["0 * * * *", "every hour, on the hour"],
    ["15 * * * *", "every hour at :15"],
    ["0 */2 * * *", "every 2 hours"],
    ["30 */6 * * *", "every 6 hours at :30"],
    ["0 2 * * *", "daily at 02:00 UTC"],
    ["30 14 * * *", "daily at 14:30 UTC"],
    ["0 2,14 * * *", "daily at 02:00 and 14:00 UTC"],
    ["0 3 * * 1-5", "weekdays at 03:00 UTC"],
    ["0 3 * * 0,6", "weekends at 03:00 UTC"],
    ["0 4 * * 1", "Mondays at 04:00 UTC"],
    ["0 4 * * 7", "Sundays at 04:00 UTC"],
    ["0 4 * * 1,3", "Mondays and Wednesdays at 04:00 UTC"],
    ["0 1 1 * *", "monthly on the 1st at 01:00 UTC"],
    ["0 1 22 * *", "monthly on the 22nd at 01:00 UTC"],
    ["0 1 13 * *", "monthly on the 13th at 01:00 UTC"],
    ["0 0 2 * * *", "daily at 02:00 UTC"],
  ])("%s → %s", (expr, expected) => {
    expect(describeCron(expr)).toBe(expected)
  })

  it.each([null, undefined, "", "bogus", "0 2 * 1 *", "0 25 * * *", "61 * * * *", "0 2 1 * 1", "5 0 2 * * *", "0 2-4 * * *", "*/0 * * * *"])(
    "returns null for unsupported %s",
    (expr) => {
      expect(describeCron(expr)).toBeNull()
    },
  )
})
