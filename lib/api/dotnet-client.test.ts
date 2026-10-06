import { describe, expect, it, vi } from "vitest"
import { backendTarget, BACKEND_AREAS } from "@/lib/api/backend-target"
import { createDotnetClient, DotnetApiError, normalizeDotnetError } from "@/lib/api/dotnet-client"

describe("backendTarget", () => {
  it("defaults every area to the legacy path", () => {
    for (const area of BACKEND_AREAS) {
      expect(backendTarget(area, {})).toBe("nextjs")
    }
  })

  it("switches only the named area when set to dotnet", () => {
    const env = { SALES: "dotnet" }
    expect(backendTarget("SALES", env)).toBe("dotnet")
    expect(backendTarget("INVENTORY", env)).toBe("nextjs")
  })

  it("treats unknown values as the legacy path", () => {
    expect(backendTarget("SALES", { SALES: "dotnett" })).toBe("nextjs")
    expect(backendTarget("SALES", { SALES: " DotNet " })).toBe("dotnet")
  })
})

describe("normalizeDotnetError", () => {
  it("reads the .NET error envelope", () => {
    const normalized = normalizeDotnetError(409, {
      error: { code: "CONFLICT", message: "Insufficient stock", details: [{ field: "quantity" }] },
    })
    expect(normalized).toEqual({
      code: "CONFLICT",
      message: "Insufficient stock",
      status: 409,
      details: [{ field: "quantity" }],
    })
  })

  it("falls back to INTERNAL when the body is not the envelope", () => {
    expect(normalizeDotnetError(502, "<html>")).toEqual({
      code: "INTERNAL",
      message: "Request failed with status 502",
      status: 502,
    })
  })
})

describe("createDotnetClient", () => {
  it("unwraps a successful response and sends the bearer token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: { id: 1 }, meta: null }), { status: 200 }))
    const client = createDotnetClient({
      baseUrl: "https://api.example.test/",
      getAccessToken: () => "tok",
      fetchImpl,
    })

    const result = await client.get<{ data: { id: number } }>("/api/v1/sales")

    expect(result).toEqual({ data: { id: 1 }, meta: null })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.example.test/api/v1/sales")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok")
  })

  it("throws a DotnetApiError carrying the normalized envelope", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Sale not found" } }), { status: 404 }),
    )
    const client = createDotnetClient({ baseUrl: "https://api.example.test", fetchImpl })

    const error = await client.get("/api/v1/sales/x").catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DotnetApiError)
    expect((error as DotnetApiError).normalized).toEqual({ code: "NOT_FOUND", message: "Sale not found", status: 404, details: undefined })
  })

  it("reports a timeout as TIMEOUT", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
    }))
    const client = createDotnetClient({ baseUrl: "https://api.example.test", fetchImpl, timeoutMs: 5 })

    const error = await client.get("/api/v1/sales").catch((e: unknown) => e)

    expect((error as DotnetApiError).normalized.code).toBe("TIMEOUT")
  })

  it("refuses to call when no base URL is configured", async () => {
    const fetchImpl = vi.fn()
    const client = createDotnetClient({ baseUrl: "", fetchImpl })

    await expect(client.get("/api/v1/sales")).rejects.toMatchObject({ normalized: { code: "NOT_CONFIGURED" } })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
