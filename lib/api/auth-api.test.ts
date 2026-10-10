import { describe, expect, it, vi } from "vitest"
import { signInWithDotnet, signUpWithDotnet, toDotnetSignInError, usernameFromEmail } from "@/lib/api/auth-api"

vi.mock("@/lib/api/client-helpers", () => ({ getCSRFToken: async () => "csrf-token" }))

describe("toDotnetSignInError", () => {
  it("keeps the code and message from a normalized BFF body", () => {
    expect(toDotnetSignInError(401, { code: "UNAUTHENTICATED", message: "Invalid credentials", status: 401 })).toEqual({
      code: "UNAUTHENTICATED",
      message: "Invalid credentials",
    })
  })

  it("falls back to the ProblemDetails title or detail", () => {
    expect(toDotnetSignInError(400, { title: "Bad request", detail: "Two-factor code required" })).toEqual({
      code: "VALIDATION_ERROR",
      message: "Two-factor code required",
    })
  })

  it("uses a status message when the body is empty", () => {
    expect(toDotnetSignInError(500, null)).toEqual({ code: "INTERNAL", message: "Request failed with status 500" })
  })
})

describe("signInWithDotnet", () => {
  it("posts credentials to the BFF login route with the CSRF header", async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(url), init])
      return new Response(null, { status: 200 })
    })

    const result = await signInWithDotnet({ email: "a@b.co", password: "pw" }, fetchImpl as unknown as typeof fetch)

    expect(result).toEqual({ ok: true })
    expect(calls[0][0]).toBe("/api/dotnet/auth/login")
    expect(calls[0][1]?.headers).toEqual({ "Content-Type": "application/json", "X-CSRF-Token": "csrf-token" })
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ email: "a@b.co", password: "pw", twoFactorCode: null, tenant: null })
  })

  it("forwards a recovery code when one is given", async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(url), init])
      return new Response(null, { status: 200 })
    })

    await signInWithDotnet({ email: "a@b.co", password: "pw", recoveryCode: "ABCDE-FGHJK" }, fetchImpl as unknown as typeof fetch)

    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      email: "a@b.co",
      password: "pw",
      twoFactorCode: null,
      tenant: null,
      recoveryCode: "ABCDE-FGHJK",
    })
  })

  it("returns the BFF error message on failure", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "Invalid credentials", status: 401 }), { status: 401 }),
    )
    const result = await signInWithDotnet({ email: "a@b.co", password: "bad" }, fetchImpl as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, code: "UNAUTHENTICATED", message: "Invalid credentials" })
  })
})

describe("signUpWithDotnet", () => {
  const input = { firstName: "Ada", lastName: "Lovelace", email: "ada@pharma.co", userName: "ada@pharma.co", password: "Secret123" }

  it("posts the registration to the BFF register route with the CSRF header and returns the user id", async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(url), init])
      return new Response(JSON.stringify({ ok: true, userId: "u-1" }), { status: 201 })
    })

    const result = await signUpWithDotnet(input, fetchImpl as unknown as typeof fetch)

    expect(result).toEqual({ ok: true, userId: "u-1" })
    expect(calls[0][0]).toBe("/api/dotnet/auth/register")
    expect(calls[0][1]?.headers).toEqual({ "Content-Type": "application/json", "X-CSRF-Token": "csrf-token" })
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@pharma.co",
      userName: "ada@pharma.co",
      password: "Secret123",
      phoneNumber: null,
    })
  })

  it("returns the BFF validation message when the email is already registered", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ code: "CONFLICT", message: "Email is already in use", status: 409 }), { status: 409 }),
    )
    const result = await signUpWithDotnet(input, fetchImpl as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, code: "CONFLICT", message: "Email is already in use" })
  })

  it("maps a ProblemDetails body from a failed request to a normalized error", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ title: "Bad request", detail: "Username must be at least 3 characters." }), { status: 400 }),
    )
    const result = await signUpWithDotnet(input, fetchImpl as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, code: "VALIDATION_ERROR", message: "Username must be at least 3 characters." })
  })
})

describe("usernameFromEmail", () => {
  it("uses the lowercased local part with a suffix", () => {
    expect(usernameFromEmail("Jane.Doe@acme.test", () => "abcd")).toBe("jane.doe-abcd")
  })

  it("strips characters Identity does not allow", () => {
    expect(usernameFromEmail("j+ane!@acme.test", () => "wxyz")).toBe("jane-wxyz")
  })

  it("never exceeds 50 characters even for very long emails", () => {
    const long = `${"a".repeat(120)}@acme.test`
    const name = usernameFromEmail(long, () => "zzzz")
    expect(name.length).toBeLessThanOrEqual(50)
    expect(name.endsWith("-zzzz")).toBe(true)
  })

  it("pads very short local parts to a valid length", () => {
    expect(usernameFromEmail("a@acme.test", () => "1234")).toBe("usera-1234")
  })
})
