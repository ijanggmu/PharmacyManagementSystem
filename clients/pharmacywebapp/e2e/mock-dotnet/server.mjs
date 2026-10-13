// Stub of the .NET API for the Playwright suite. The Next.js BFF (proxy.ts, /api/dotnet/*, Server
// Components) talks to this server instead of the real backend, so the E2E run needs no database,
// Redis or API. It only answers what the suite needs, from the fixtures in ./fixtures.mjs:
//   - identity token issue/refresh (a fake, unsigned JWT the BFF decodes for claims),
//   - the reads the shell and pages make on load.
// Specs can still override any browser-side call with page.route("**/api/dotnet/**").
// Unknown routes answer 404 ProblemDetails and are logged, which pages already handle as "no data".
import http from "node:http"
import { routes, sessionClaims } from "./fixtures.mjs"

const port = Number(process.env.MOCK_DOTNET_PORT ?? 5199)

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

/** Unsigned JWT: the BFF only decodes claims (the real API verifies signatures, this stub does not). */
function fakeJwt() {
  const now = Math.floor(Date.now() / 1000)
  return `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ ...sessionClaims, iat: now, exp: now + 8 * 3600 })}.e2e`
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(body === undefined ? "" : JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8")
      try {
        resolve(raw ? JSON.parse(raw) : null)
      } catch {
        resolve(raw)
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`)
  const path = url.pathname.replace(/\/+$/, "")
  const body = await readBody(req)

  if (req.method === "GET" && path === "/health") return send(res, 200, { status: "ok" })

  if (req.method === "POST" && path === "/api/v1/identity/token/issue") {
    if (body?.password === "wrong-password") {
      return send(res, 401, { title: "Unauthorized", status: 401, detail: "Invalid credentials." })
    }
    return send(res, 200, {
      accessToken: fakeJwt(),
      refreshToken: "e2e-refresh",
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })
  }
  if (req.method === "POST" && path === "/api/v1/identity/token/refresh") {
    return send(res, 200, {
      token: fakeJwt(),
      refreshToken: "e2e-refresh",
      refreshTokenExpiryTime: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })
  }

  const route = routes.find((r) => r.method === req.method && r.path.test(path))
  if (route) {
    const result = typeof route.body === "function" ? route.body({ url, path, body }) : route.body
    return send(res, route.status ?? 200, result)
  }

  console.warn(`[mock-dotnet] unhandled ${req.method} ${path}${url.search}`)
  return send(res, 404, { title: "Not Found", status: 404, detail: `No e2e fixture for ${req.method} ${path}` })
})

server.listen(port, "127.0.0.1", () => {
  console.log(`[mock-dotnet] listening on http://127.0.0.1:${port}`)
})
