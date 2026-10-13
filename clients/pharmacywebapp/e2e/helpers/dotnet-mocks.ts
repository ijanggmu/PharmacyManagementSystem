import type { Page, Request, Route } from "@playwright/test"

/**
 * Per-test overrides of the .NET API, intercepted in the browser at the BFF boundary (/api/dotnet/*).
 * Anything not overridden here falls through to the BFF, which proxies to the stub .NET server
 * (e2e/mock-dotnet) and its shared fixtures.
 */

export type MockReply = { status?: number; body?: unknown } | undefined
export type MockHandler = (request: Request) => MockReply | Promise<MockReply>

/** Path under /api/v1 (as the BFF forwards it), e.g. "/sales" or /^\/sales\/[^/]+$/. Query strings are ignored. */
export async function mockDotnet(page: Page, method: string, path: string | RegExp, reply: MockHandler | MockReply) {
  const matches = (url: URL) => {
    if (!url.pathname.startsWith("/api/dotnet/")) return false
    const rest = url.pathname.slice("/api/dotnet".length).replace(/^\/api\/v1/, "")
    return typeof path === "string" ? rest === path : path.test(rest)
  }
  await page.route(matches, async (route: Route) => {
    if (route.request().method() !== method) return route.fallback()
    const result = typeof reply === "function" ? await reply(route.request()) : reply
    if (!result) return route.fallback()
    const status = result.status ?? 200
    await route.fulfill({
      status,
      contentType: status >= 400 ? "application/problem+json" : "application/json",
      body: result.body === undefined ? "" : JSON.stringify(result.body),
    })
  })
}

export const paged = <T>(items: T[]) => ({
  items,
  totalCount: items.length,
  pageNumber: 1,
  pageSize: Math.max(10, items.length),
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
})

export function problem(status: number, detail: string, extra: Record<string, unknown> = {}) {
  return { status, body: { type: "about:blank", title: extra.title ?? "Error", status, detail, ...extra } }
}
