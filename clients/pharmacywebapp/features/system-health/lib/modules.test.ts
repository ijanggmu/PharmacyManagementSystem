import { describe, expect, it } from "vitest"
import type { HealthEntry, MigrationContextStatus } from "@/lib/api/system-health-api"
import { filterAndSortModules, latencyFraction, maxLatency, mergeModules, moduleSeverity, shortMigrationName } from "./modules"

const check = (name: string, status: HealthEntry["status"] = "Healthy", durationMs = 10): HealthEntry => ({ name, status, durationMs })
const ctx = (module: string, over: Partial<MigrationContextStatus> = {}): MigrationContextStatus => ({
  module,
  provider: "PostgreSQL",
  lastAppliedMigration: "20250101120000_Init",
  pendingMigrations: [],
  hasPendingMigrations: false,
  error: null,
  ...over,
})

describe("mergeModules", () => {
  it("merges db checks with migration contexts case-insensitively and skips platform checks", () => {
    const rows = mergeModules(
      [check("self"), check("redis"), check("hangfire"), check("db:tenants-migrations"), check("db:sales", "Healthy", 12), check("db:catalog", "Unhealthy", 900)],
      [ctx("Sales"), ctx("Catalog", { pendingMigrations: ["20250201000000_AddX"], hasPendingMigrations: true }), ctx("Chat")],
    )
    expect(rows.map((r) => r.key).sort()).toEqual(["catalog", "chat", "sales"])
    const sales = rows.find((r) => r.key === "sales")!
    expect(sales.name).toBe("Sales")
    expect(sales.check?.name).toBe("db:sales")
    expect(sales.latencyMs).toBe(12)
    expect(sales.hasIssue).toBe(false)
    const catalog = rows.find((r) => r.key === "catalog")!
    expect(catalog.pendingCount).toBe(1)
    expect(catalog.hasIssue).toBe(true)
    const chat = rows.find((r) => r.key === "chat")!
    expect(chat.check).toBeNull()
    expect(chat.dbStatus).toBe("Unknown")
    expect(chat.latencyMs).toBeNull()
  })

  it("works without migrations (DB health only) and title-cases names", () => {
    const rows = mergeModules([check("db:multitenancy")], undefined)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe("Multitenancy")
    expect(rows[0].migration).toBeNull()
  })

  it("flags migration errors as issues", () => {
    const [row] = mergeModules([check("db:files")], [ctx("Files", { error: "boom" })])
    expect(row.migrationError).toBe("boom")
    expect(row.hasIssue).toBe(true)
    expect(moduleSeverity(row)).toBe(0)
  })
})

describe("filterAndSortModules", () => {
  const rows = mergeModules(
    [check("db:sales", "Healthy", 30), check("db:accounting", "Degraded", 300), check("db:billing", "Unhealthy", 5), check("db:inventory", "Healthy", 80)],
    [ctx("Inventory", { pendingMigrations: ["a", "b"], hasPendingMigrations: true })],
  )

  it("sorts by name", () => {
    expect(filterAndSortModules(rows, { search: "", status: "all", sort: "name" }).map((r) => r.key)).toEqual(["accounting", "billing", "inventory", "sales"])
  })
  it("sorts by latency descending", () => {
    expect(filterAndSortModules(rows, { search: "", status: "all", sort: "latency" }).map((r) => r.key)).toEqual(["accounting", "inventory", "sales", "billing"])
  })
  it("sorts by status, worst first", () => {
    expect(filterAndSortModules(rows, { search: "", status: "all", sort: "status" }).map((r) => r.key)).toEqual(["billing", "accounting", "inventory", "sales"])
  })
  it("filters issues / healthy", () => {
    expect(filterAndSortModules(rows, { search: "", status: "issues", sort: "name" }).map((r) => r.key)).toEqual(["accounting", "billing", "inventory"])
    expect(filterAndSortModules(rows, { search: "", status: "healthy", sort: "name" }).map((r) => r.key)).toEqual(["sales"])
  })
  it("searches case-insensitively", () => {
    expect(filterAndSortModules(rows, { search: "ACC", status: "all", sort: "name" }).map((r) => r.key)).toEqual(["accounting"])
    expect(filterAndSortModules(rows, { search: "nope", status: "all", sort: "name" })).toEqual([])
  })
  it("does not mutate input", () => {
    const before = rows.map((r) => r.key)
    filterAndSortModules(rows, { search: "", status: "all", sort: "latency" })
    expect(rows.map((r) => r.key)).toEqual(before)
  })
})

describe("latency helpers", () => {
  it("computes relative fractions", () => {
    const rows = mergeModules([check("db:a", "Healthy", 50), check("db:b", "Healthy", 200)], [])
    const max = maxLatency(rows)
    expect(max).toBe(200)
    expect(latencyFraction(50, max)).toBe(0.25)
    expect(latencyFraction(null, max)).toBe(0)
    expect(latencyFraction(500, max)).toBe(1)
    expect(maxLatency([])).toBe(1)
  })
})

describe("shortMigrationName", () => {
  it("shortens EF ids", () => {
    expect(shortMigrationName("20250114093000_AddSaleReturns")).toBe("AddSaleReturns · 2025-01-14")
  })
  it("passes through other names and handles null", () => {
    expect(shortMigrationName("Init")).toBe("Init")
    expect(shortMigrationName(null)).toBe("None")
  })
})
