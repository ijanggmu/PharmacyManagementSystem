import { describe, expect, it } from "vitest"
import { en } from "@/lib/i18n/messages/en"
import { ne } from "@/lib/i18n/messages/ne"
import { DICTIONARIES, createNamespaceTranslator, flattenKeys, interpolate, translate } from "@/lib/i18n/translate"
import { LOCALES, parseLocale, parseNepaliDigits } from "@/lib/i18n/config"

function leaf(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe("message dictionaries", () => {
  const enKeys = flattenKeys(en).sort()
  const neKeys = flattenKeys(ne).sort()

  it("has the same keys in every locale", () => {
    expect(enKeys.length).toBeGreaterThan(100)
    expect(neKeys).toEqual(enKeys)
    for (const locale of LOCALES) expect(flattenKeys(DICTIONARIES[locale]).sort()).toEqual(enKeys)
  })

  it("has no empty or placeholder (TODO) translations", () => {
    for (const locale of LOCALES) {
      for (const key of enKeys) {
        const value = leaf(DICTIONARIES[locale], key)
        expect(typeof value, `${locale}:${key}`).toBe("string")
        expect((value as string).trim(), `${locale}:${key}`).not.toBe("")
        expect(value, `${locale}:${key}`).not.toBe("TODO")
      }
    }
  })

  it("keeps the same {placeholders} in both languages", () => {
    for (const key of enKeys) {
      expect(placeholders(leaf(ne, key) as string), key).toEqual(placeholders(leaf(en, key) as string))
    }
  })

  it("actually translates: most Nepali strings contain Devanagari", () => {
    const devanagari = neKeys.filter((k) => /[ऀ-ॿ]/.test(leaf(ne, k) as string))
    expect(devanagari.length / neKeys.length).toBeGreaterThan(0.85)
  })
})

describe("translate", () => {
  it("looks up dot paths per locale and interpolates params", () => {
    expect(translate("en", "print.titles.taxInvoice")).toBe("Tax Invoice")
    expect(translate("ne", "print.titles.taxInvoice")).toBe("कर बीजक")
    expect(translate("ne", "print.titles.abbreviatedTaxInvoice")).toBe("संक्षिप्त कर बीजक")
    expect(createNamespaceTranslator("en", "common")("validation.required", { field: "Name" })).toBe("Name is required")
  })

  it("leaves unknown placeholders visible", () => {
    expect(interpolate("Hello {name} {missing}", { name: "Sita" })).toBe("Hello Sita {missing}")
  })
})

describe("preference parsing", () => {
  it("falls back to English and defaults Nepali digits on", () => {
    expect(parseLocale("ne")).toBe("ne")
    expect(parseLocale("fr")).toBe("en")
    expect(parseLocale(undefined)).toBe("en")
    expect(parseNepaliDigits(undefined)).toBe(true)
    expect(parseNepaliDigits("0")).toBe(false)
  })
})
