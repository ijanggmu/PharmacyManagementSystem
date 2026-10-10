import { describe, expect, it, vi } from "vitest"
import { createDotnetClient, DotnetApiError, DOTNET_PROXY_BASE, normalizeDotnetPath } from "@/lib/api/dotnet-client"

describe("createDotnetClient", () => {
  it("calls the same-origin proxy with cookies and no bearer token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ id: 1 }]), { status: 200 }))
    const client = createDotnetClient({ fetchImpl })

    await expect(client.get("/notifications")).resolves.toEqual([{ id: 1 }])

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${DOTNET_PROXY_BASE}/notifications`)
    expect(init.credentials).toBe("same-origin")
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it("fetches a CSRF token and sends it on every write", async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url))
      if (String(url) === "/api/csrf/token") return new Response(JSON.stringify({ token: "csrf-1" }), { status: 200 })
      return new Response(JSON.stringify("created-id"), { status: 200 })
    })
    const client = createDotnetClient({ fetchImpl })

    await client.post("/categories", { name: "A" })

    expect(calls).toEqual(["/api/csrf/token", `${DOTNET_PROXY_BASE}/categories`])
    const writeInit = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect((writeInit[1].headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-1")
  })

  it("does not fetch a CSRF token for reads", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", { status: 200 }))
    await createDotnetClient({ fetchImpl }).get("/sales")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("maps a ProblemDetails error to the normalized shape", async () => {
    const problem = { type: "https://tools.ietf.org/html/rfc7231#section-6.5.8", title: "Conflict", status: 409, detail: "Insufficient stock" }
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url) === "/api/csrf/token"
        ? new Response(JSON.stringify({ token: "t" }), { status: 200 })
        : new Response(JSON.stringify(problem), { status: 409 }),
    )
    const error = await createDotnetClient({ fetchImpl }).post("/sales", {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DotnetApiError)
    expect((error as DotnetApiError).normalized).toEqual({ code: "CONFLICT", message: "Insufficient stock", status: 409, details: undefined })
  })

  it("maps validation errors with their field details", async () => {
    const problem = { title: "Validation error", status: 400, detail: "One or more validation errors occurred.", errors: { Name: ["Required"] } }
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url) === "/api/csrf/token"
        ? new Response(JSON.stringify({ token: "t" }), { status: 200 })
        : new Response(JSON.stringify(problem), { status: 400 }),
    )
    const error = (await createDotnetClient({ fetchImpl }).post("/medicines", {}).catch((e: unknown) => e)) as DotnetApiError
    expect(error.normalized.code).toBe("VALIDATION_ERROR")
    expect(error.normalized.details).toEqual({ Name: ["Required"] })
  })

  it("reports a timeout as TIMEOUT", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
    }))
    const error = (await createDotnetClient({ fetchImpl, timeoutMs: 5 }).get("/sales").catch((e: unknown) => e)) as DotnetApiError
    expect(error.normalized.code).toBe("TIMEOUT")
  })

  it("returns undefined for 204 No Content", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url) === "/api/csrf/token"
        ? new Response(JSON.stringify({ token: "t" }), { status: 200 })
        : new Response(null, { status: 204 }),
    )
    await expect(createDotnetClient({ fetchImpl }).post("/notifications/read-all")).resolves.toBeUndefined()
  })
})

describe("normalizeDotnetPath", () => {
  it("strips a leading /api/v1 so the proxy does not double it", () => {
    expect(normalizeDotnetPath("/api/v1/notifications?unreadOnly=true")).toBe("/notifications?unreadOnly=true")
    expect(normalizeDotnetPath("/api/v1/notifications/read-all")).toBe("/notifications/read-all")
  })

  it("leaves paths without the prefix unchanged and adds a missing slash", () => {
    expect(normalizeDotnetPath("/accounting/expenses")).toBe("/accounting/expenses")
    expect(normalizeDotnetPath("sales")).toBe("/sales")
  })

  it("does not strip a segment that only starts with the same characters", () => {
    expect(normalizeDotnetPath("/api/v10/things")).toBe("/api/v10/things")
  })
})
