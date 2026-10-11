import { describe, expect, it } from "vitest"
import { redactHealthForTenant } from "./system-health-redact"

const probe = {
  status: "Unhealthy",
  results: [
    { name: "self", status: "Healthy", durationMs: 1, details: {} },
    { name: "db:sales", status: "Healthy", durationMs: 5, details: { host: "db-1" } },
    { name: "db:tenants-migrations", status: "Unhealthy", durationMs: 9, details: { "other-tenant": "pending" } },
  ],
}

describe("redactHealthForTenant", () => {
  it("removes cross-tenant checks and every detail", () => {
    const out = redactHealthForTenant(probe) as typeof probe
    expect(out.results.map((r) => r.name)).toEqual(["self", "db:sales"])
    expect(out.results.every((r) => r.details === null)).toBe(true)
    expect(JSON.stringify(out)).not.toContain("other-tenant")
  })

  it("recomputes the overall status without the removed checks", () => {
    expect((redactHealthForTenant(probe) as typeof probe).status).toBe("Healthy")
    const degraded = { ...probe, results: [...probe.results, { name: "redis", status: "Degraded", durationMs: 3 }] }
    expect((redactHealthForTenant(degraded) as typeof probe).status).toBe("Degraded")
  })

  it("passes through anything that is not a probe result", () => {
    expect(redactHealthForTenant(null)).toBeNull()
    expect(redactHealthForTenant({ error: "x" })).toEqual({ error: "x" })
  })
})
