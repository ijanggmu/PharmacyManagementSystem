import { beforeEach, describe, expect, it, vi } from "vitest"

const { get, put, post } = vi.hoisted(() => ({
  get: vi.fn((..._args: unknown[]) => Promise.resolve({} as unknown)),
  put: vi.fn((..._args: unknown[]) => Promise.resolve({} as unknown)),
  post: vi.fn((..._args: unknown[]) => Promise.resolve({} as unknown)),
}))

vi.mock("@/lib/api/dotnet-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dotnet-client")>()
  return { ...actual, dotnetClient: { get, put, post, patch: vi.fn(), delete: vi.fn() } }
})

import { DotnetApiError } from "@/lib/api/dotnet-client"
import {
  buildFonepayQrBody,
  buildPaymentSettingsBody,
  emptyPaymentSettings,
  isAllowedQrDataUrl,
  parsePaymentSettings,
  paymentSettingsApi,
  toPaymentSettingsInput,
  validatePaymentSettingsInput,
  validateQrImageFile,
  type PaymentSettingsInput,
} from "@/lib/api/payment-settings-api"

const PNG = "data:image/png;base64,iVBORw0KGgo="

const dto = {
  bankQrEnabled: true,
  bankName: "Nabil Bank",
  accountName: "Sagarmatha Pharmacy",
  accountNumber: "0123456789",
  bankQrImage: PNG,
  fonepayEnabled: true,
  fonepayMerchantCode: "NBQM123",
  fonepayUsername: "pharma-api",
  fonepayEnvironment: "live",
  fonepayHasSecret: true,
  fonepayHasPassword: false,
}

beforeEach(() => {
  get.mockReset()
  put.mockReset()
  post.mockReset()
})

describe("parsePaymentSettings", () => {
  it("accepts the documented DTO", () => {
    expect(parsePaymentSettings(dto)).toEqual(dto)
  })

  it("normalizes blanks to null, missing flags to false and unknown environments to dev", () => {
    expect(parsePaymentSettings({ bankName: "  ", fonepayEnvironment: "LIVE" }).fonepayEnvironment).toBe("live")
    expect(parsePaymentSettings({ fonepayEnvironment: "staging" }).fonepayEnvironment).toBe("dev")
    expect(emptyPaymentSettings()).toEqual({
      bankQrEnabled: false,
      bankName: null,
      accountName: null,
      accountNumber: null,
      bankQrImage: null,
      fonepayEnabled: false,
      fonepayMerchantCode: null,
      fonepayUsername: null,
      fonepayEnvironment: "dev",
      fonepayHasSecret: false,
      fonepayHasPassword: false,
    })
  })

  it("rejects a malformed DTO", () => {
    expect(() => parsePaymentSettings({ bankQrEnabled: "yes" })).toThrow()
  })
})

describe("buildPaymentSettingsBody", () => {
  it("trims text, turns blanks into null and sends blank secrets as null (keep existing)", () => {
    const input: PaymentSettingsInput = {
      ...toPaymentSettingsInput(parsePaymentSettings(dto)),
      bankName: "  Nabil Bank ",
      accountNumber: "",
    }
    expect(buildPaymentSettingsBody(input)).toEqual({
      bankQrEnabled: true,
      bankName: "Nabil Bank",
      accountName: "Sagarmatha Pharmacy",
      accountNumber: null,
      bankQrImage: PNG,
      fonepayEnabled: true,
      fonepayMerchantCode: "NBQM123",
      fonepayUsername: "pharma-api",
      fonepayEnvironment: "live",
      fonepaySecretKey: null,
      fonepayPassword: null,
    })
  })

  it("sends new secrets when entered", () => {
    const input = { ...toPaymentSettingsInput(parsePaymentSettings(dto)), fonepayPassword: " p@ss ", fonepaySecretKey: "s3cr3t" }
    const body = buildPaymentSettingsBody(input)
    expect(body.fonepayPassword).toBe("p@ss")
    expect(body.fonepaySecretKey).toBe("s3cr3t")
  })
})

describe("validatePaymentSettingsInput", () => {
  const base = toPaymentSettingsInput(emptyPaymentSettings())

  it("passes when everything is disabled", () => {
    expect(validatePaymentSettingsInput(base)).toEqual({})
  })

  it("requires the QR image and account name when bank QR is enabled", () => {
    const errors = validatePaymentSettingsInput({ ...base, bankQrEnabled: true })
    expect(Object.keys(errors).sort()).toEqual(["accountName", "bankQrImage"])
  })

  it("requires secrets only when none are saved", () => {
    const enabled = { ...base, fonepayEnabled: true, fonepayMerchantCode: "M", fonepayUsername: "U" }
    expect(Object.keys(validatePaymentSettingsInput(enabled)).sort()).toEqual(["fonepayPassword", "fonepaySecretKey"])
    expect(validatePaymentSettingsInput(enabled, { fonepayHasPassword: true, fonepayHasSecret: true })).toEqual({})
  })
})

describe("QR image checks", () => {
  it("validates picked files by type and size", () => {
    expect(validateQrImageFile({ type: "image/png", size: 100_000 })).toBeNull()
    expect(validateQrImageFile({ type: "image/gif", size: 1 })).toMatch(/PNG, JPEG or WebP/)
    expect(validateQrImageFile({ type: "image/jpeg", size: 600 * 1024 })).toMatch(/500 KB/)
  })

  it("only accepts png/jpeg/webp data URLs within the size limit", () => {
    expect(isAllowedQrDataUrl(PNG)).toBe(true)
    expect(isAllowedQrDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false)
    expect(isAllowedQrDataUrl(`data:image/png;base64,${"A".repeat(700_001)}`)).toBe(false)
  })
})

describe("buildFonepayQrBody", () => {
  it("rounds the amount to paisa and trims remarks", () => {
    expect(buildFonepayQrBody({ amount: 44.099999, remarks1: "  INV-1  ", remarks2: "" })).toEqual({
      amount: 44.1,
      remarks1: "INV-1",
    })
  })
})

describe("paymentSettingsApi", () => {
  it("GETs /sales/payment-settings and validates the response", async () => {
    get.mockResolvedValueOnce(dto)
    await expect(paymentSettingsApi.get()).resolves.toEqual(dto)
    expect(get).toHaveBeenCalledWith("/sales/payment-settings")
  })

  it("treats 404/503 as not configured", async () => {
    get.mockRejectedValueOnce(new DotnetApiError({ code: "NOT_FOUND", message: "Not found", status: 404 }))
    await expect(paymentSettingsApi.get()).resolves.toBeNull()
    get.mockRejectedValueOnce(new DotnetApiError({ code: "INTERNAL", message: "Unavailable", status: 503 }))
    await expect(paymentSettingsApi.get()).resolves.toBeNull()
  })

  it("rethrows other errors", async () => {
    get.mockRejectedValueOnce(new DotnetApiError({ code: "FORBIDDEN", message: "Forbidden", status: 403 }))
    await expect(paymentSettingsApi.get()).rejects.toThrow("Forbidden")
  })

  it("PUTs the mapped body", async () => {
    put.mockResolvedValueOnce(dto)
    await paymentSettingsApi.update(toPaymentSettingsInput(parsePaymentSettings(dto)))
    expect(put).toHaveBeenCalledWith("/sales/payment-settings", expect.objectContaining({ fonepayPassword: null }))
  })

  it("creates a Fonepay QR and polls its status", async () => {
    post.mockResolvedValueOnce({ prn: "PRN-1", qrMessage: "000201...", amount: 44.1, createdAtUtc: "2026-10-08T00:00:00Z" })
    const qr = await paymentSettingsApi.createFonepayQr({ amount: 44.1 })
    expect(qr.webSocketUrl).toBeNull()
    expect(post).toHaveBeenCalledWith("/sales/fonepay/qr", { amount: 44.1 })

    get.mockResolvedValueOnce({ prn: "PRN 1", status: "Success", traceId: "TR-9" })
    await expect(paymentSettingsApi.getFonepayQrStatus("PRN 1")).resolves.toEqual({
      prn: "PRN 1",
      status: "success",
      message: null,
      traceId: "TR-9",
    })
    expect(get).toHaveBeenCalledWith("/sales/fonepay/qr/PRN%201/status")
  })
})
