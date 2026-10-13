/**
 * Next.js instrumentation hook. `onRequestError` is called by Next for every uncaught error in a server
 * component, route handler, server action or the proxy, so wiring it here reports server-side failures without
 * touching each route. Reporting is a no-op unless SENTRY_DSN is set (see lib/observability/error-reporter.ts).
 */

import { reportServerError } from "@/lib/observability/error-reporter"

export function register(): void {
  // Nothing to initialise: the reporter is stateless and reads its configuration per call.
}

interface RequestErrorRequest {
  path: string
  method: string
}

interface RequestErrorContext {
  routerKind?: string
  routePath?: string
  routeType?: string
  renderSource?: string
}

export async function onRequestError(
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext,
): Promise<void> {
  await reportServerError(error, {
    method: request.method,
    path: request.path,
    tags: {
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      renderSource: context.renderSource,
      source: "next",
    },
  })
}
