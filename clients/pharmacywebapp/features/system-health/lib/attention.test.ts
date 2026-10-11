import { describe, expect, it } from "vitest"
import type { JobsStatus } from "@/lib/api/system-health-api"
import { buildAttentionItems } from "./attention"

const now = Date.parse("2026-01-01T12:00:00Z")

const jobs = (over: Partial<JobsStatus> = {}): JobsStatus => ({
  enabled: true,
  generatedAtUtc: null,
  statistics: { servers: 1, queues: 1, enqueued: 0, scheduled: 0, processing: 0, succeeded: 10, failed: 0, deleted: 0, recurring: 1 },
  servers: [{ name: "srv", queues: ["default"], workersCount: 4, startedAt: "", heartbeat: new Date(now - 10_000).toISOString() }],
  recurringJobs: [],
  recentFailed: [],
  error: null,
  ...over,
})

describe("buildAttentionItems", () => {
  it("is empty when everything is healthy", () => {
    expect(
      buildAttentionItems({
        readiness: { snapshot: { httpStatus: 200, roundTripMs: 20, result: { status: "Healthy", results: [{ name: "self", status: "Healthy", durationMs: 1 }] } }, error: null },
        jobs: jobs(),
        migrations: { generatedAtUtc: "", contexts: [{ module: "Sales", provider: null, lastAppliedMigration: "x", pendingMigrations: [], hasPendingMigrations: false, error: null }] },
        ird: { pendingCount: 3, failedCount: 0, salesFailedCount: 0, recentFailed: [] },
        now,
      }),
    ).toEqual([])
  })

  it("collects problems from every source, critical first, with the right tab", () => {
    const items = buildAttentionItems({
      readiness: {
        snapshot: {
          httpStatus: 503,
          roundTripMs: 20,
          result: {
            status: "Unhealthy",
            results: [
              { name: "redis", status: "Degraded", durationMs: 1 },
              { name: "db:sales", status: "Unhealthy", durationMs: 1 },
            ],
          },
        },
        error: null,
      },
      jobs: jobs({
        statistics: { servers: 1, queues: 1, enqueued: 0, scheduled: 0, processing: 0, succeeded: 0, failed: 2, deleted: 0, recurring: 1 },
        recurringJobs: [{ id: "ird-sync", cron: null, queue: null, nextExecution: null, lastExecution: null, lastJobState: "Failed", error: null }],
        servers: [{ name: "srv", queues: [], workersCount: 1, startedAt: "", heartbeat: new Date(now - 5 * 60_000).toISOString() }],
      }),
      migrations: {
        generatedAtUtc: "",
        contexts: [
          { module: "Catalog", provider: null, lastAppliedMigration: null, pendingMigrations: ["a"], hasPendingMigrations: true, error: null },
          { module: "Files", provider: null, lastAppliedMigration: null, pendingMigrations: [], hasPendingMigrations: false, error: "denied" },
        ],
      },
      ird: { pendingCount: 0, failedCount: 1, salesFailedCount: 2, recentFailed: [] },
      now,
    })
    const ids = items.map((i) => i.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        "check:redis",
        "check:db:sales",
        "jobs-stale",
        "recurring:ird-sync",
        "jobs-failed",
        "migration-pending:Catalog",
        "migration-error:Files",
        "ird-failed",
        "ird-sales-failed",
      ]),
    )
    expect(items.find((i) => i.id === "check:db:sales")?.tab).toBe("modules")
    expect(items.find((i) => i.id === "check:redis")?.tab).toBe("services")
    expect(items.find((i) => i.id === "ird-failed")?.tab).toBe("ird")
    const firstWarning = items.findIndex((i) => i.severity === "warning")
    expect(items.slice(0, firstWarning).every((i) => i.severity === "critical")).toBe(true)
    expect(items.slice(firstWarning).every((i) => i.severity === "warning")).toBe(true)
  })

  it("reports an unreachable API", () => {
    const items = buildAttentionItems({ readiness: { snapshot: { httpStatus: 0, roundTripMs: 0, result: null, error: "ECONNREFUSED" }, error: null } })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: "api-unreachable", severity: "critical", description: "ECONNREFUSED" })
  })

  it("flags no running job server and ignores disabled jobs", () => {
    const stats = { servers: 0, queues: 0, enqueued: 0, scheduled: 0, processing: 0, succeeded: 0, failed: 0, deleted: 0, recurring: 0 }
    expect(buildAttentionItems({ jobs: jobs({ statistics: stats, servers: [] }), now }).map((i) => i.id)).toEqual(["jobs-no-server"])
    expect(buildAttentionItems({ jobs: jobs({ enabled: false, statistics: stats, servers: [] }), now })).toEqual([])
  })
})
