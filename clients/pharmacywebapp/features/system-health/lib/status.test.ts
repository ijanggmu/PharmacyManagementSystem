import { describe, expect, it } from "vitest"
import type { HealthEntry, ProbeSnapshot } from "@/lib/api/system-health-api"
import { isPlatformCheck, moduleKeyOfCheck, overallStatus, statusRank, summarizeChecks, worstStatus } from "./status"
import { availableTabs, resolveTab } from "./tabs"
import { formatRelative, formatSecondsAgo, isStaleHeartbeat } from "./time"
import { detailValueText, filterRecurringJobs, jobStateTone, tenantRowsFromDetails } from "./details"

const snap = (over: Partial<ProbeSnapshot>): ProbeSnapshot => ({ httpStatus: 200, roundTripMs: 40, result: { status: "Healthy", results: [] }, ...over })

describe("overallStatus", () => {
  it("handles loading, unreachable and reported states", () => {
    expect(overallStatus(undefined, { loading: true, failed: false })).toBe("Loading")
    expect(overallStatus(undefined, { loading: false, failed: true })).toBe("Unreachable")
    expect(overallStatus(snap({ httpStatus: 0, result: null }), { loading: false, failed: false })).toBe("Unreachable")
    expect(overallStatus(snap({ httpStatus: 503, result: { status: "Unhealthy", results: [] } }), { loading: false, failed: false })).toBe("Unhealthy")
    expect(overallStatus(snap({}), { loading: false, failed: false })).toBe("Healthy")
  })
})

describe("status helpers", () => {
  it("ranks worst first", () => {
    expect(statusRank("Unreachable")).toBeLessThan(statusRank("Unhealthy"))
    expect(statusRank("Unhealthy")).toBeLessThan(statusRank("Degraded"))
    expect(statusRank("Degraded")).toBeLessThan(statusRank("Healthy"))
    expect(worstStatus(["Healthy", "Degraded", "Healthy"])).toBe("Degraded")
    expect(worstStatus([])).toBe("Unknown")
  })
  it("summarises checks", () => {
    const results: HealthEntry[] = [
      { name: "self", status: "Healthy", durationMs: 1 },
      { name: "db:sales", status: "Degraded", durationMs: 90 },
      { name: "redis", status: "Unhealthy", durationMs: 30 },
    ]
    const s = summarizeChecks(results)
    expect(s).toMatchObject({ total: 3, passing: 1, degraded: 1, failing: 1 })
    expect(s.slowest?.name).toBe("db:sales")
    expect(summarizeChecks([]).slowest).toBeNull()
  })
  it("classifies check names", () => {
    expect(moduleKeyOfCheck("db:Sales")).toBe("sales")
    expect(moduleKeyOfCheck("db:tenants-migrations")).toBeNull()
    expect(isPlatformCheck("hangfire")).toBe(true)
    expect(isPlatformCheck("db:catalog")).toBe(false)
  })
})

describe("tabs", () => {
  it("hides tabs by permission", () => {
    expect(availableTabs({ canViewPlatform: false, canViewIrd: true })).toEqual(["overview", "modules", "services", "ird"])
    expect(availableTabs({ canViewPlatform: true, canViewIrd: false })).toEqual(["overview", "modules", "services", "jobs", "migrations"])
  })
  it("falls back to overview for unknown or forbidden tabs", () => {
    const allowed = availableTabs({ canViewPlatform: false, canViewIrd: true })
    expect(resolveTab("jobs", allowed)).toBe("overview")
    expect(resolveTab("ird", allowed)).toBe("ird")
    expect(resolveTab(null, allowed)).toBe("overview")
    expect(resolveTab("garbage", allowed)).toBe("overview")
  })
})

describe("time", () => {
  const now = Date.parse("2026-01-01T12:00:00Z")
  it("formats past and future", () => {
    expect(formatRelative(now - 2_000, now)).toBe("just now")
    expect(formatRelative(now - 30_000, now)).toBe("30s ago")
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5 min ago")
    expect(formatRelative(now + 3 * 3_600_000, now)).toBe("in 3 h")
    expect(formatRelative(now + 2 * 86_400_000, now)).toBe("in 2 d")
    expect(formatRelative(null, now)).toBe("—")
    expect(formatRelative("not a date", now)).toBe("—")
  })
  it("formats seconds ago", () => {
    expect(formatSecondsAgo(now - 1_000, now)).toBe("just now")
    expect(formatSecondsAgo(now - 12_000, now)).toBe("12s ago")
    expect(formatSecondsAgo(now - 180_000, now)).toBe("3m ago")
  })
  it("detects stale heartbeats", () => {
    expect(isStaleHeartbeat(new Date(now - 60_000).toISOString(), now)).toBe(false)
    expect(isStaleHeartbeat(new Date(now - 3 * 60_000).toISOString(), now)).toBe(true)
    expect(isStaleHeartbeat(null, now)).toBe(true)
  })
})

describe("details", () => {
  it("renders values", () => {
    expect(detailValueText("x")).toBe("x")
    expect(detailValueText(3)).toBe("3")
    expect(detailValueText(null)).toBe("—")
    expect(detailValueText({ a: 1 })).toBe('{"a":1}')
  })
  it("builds tenant rows, problems first", () => {
    const rows = tenantRowsFromDetails({ t1: "Healthy", t2: { status: "Pending: 2" }, t3: "Failed: timeout", t4: 42 })
    expect(rows.map((r) => [r.tenant, r.tone])).toEqual([
      ["t3", "failing"],
      ["t2", "warning"],
      ["t4", "unknown"],
      ["t1", "healthy"],
    ])
    expect(tenantRowsFromDetails(null)).toEqual([])
  })
  it("filters recurring jobs and maps states", () => {
    const jobs = [
      { id: "ird-sync", cron: "*/5 * * * *", queue: "default", nextExecution: null, lastExecution: null, lastJobState: "Succeeded", error: null },
      { id: "cleanup", cron: "0 2 * * *", queue: "low", nextExecution: null, lastExecution: null, lastJobState: "Failed", error: null },
    ]
    expect(filterRecurringJobs(jobs, "IRD").map((j) => j.id)).toEqual(["ird-sync"])
    expect(filterRecurringJobs(jobs, "").length).toBe(2)
    expect(jobStateTone("Succeeded", null)).toBe("success")
    expect(jobStateTone("Succeeded", "err")).toBe("danger")
    expect(jobStateTone(null, null)).toBe("muted")
  })
})
