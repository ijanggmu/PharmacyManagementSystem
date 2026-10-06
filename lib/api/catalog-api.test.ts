import { describe, expect, it } from "vitest"
import {
  nepalCatalogPath,
  priceScheduleBody,
  similarNamesPath,
  toNepalCatalogItem,
  toPriceHistoryRow,
  toPriceHistoryStatus,
  toSimilarMedicineName,
  type DotnetMedicinePriceHistoryDto,
  type DotnetNepalCatalogEntryDto,
} from "@/lib/api/catalog-api"

const nepal: DotnetNepalCatalogEntryDto = {
  id: "n1",
  brandName: "Dolo 650",
  genericName: "Paracetamol",
  form: "Tablet",
  strength: "650 mg",
  manufacturer: "Micro Labs",
  categoryName: "Analgesic",
  dosage: "1 tablet",
  unitPrice: 12.5,
  costPrice: null,
  description: null,
  sideEffects: null,
  storageInstructions: "Below 30C",
  prescriptionRequired: false,
}

describe("toNepalCatalogItem", () => {
  it("maps camelCase fields to the legacy snake_case item", () => {
    expect(toNepalCatalogItem(nepal)).toEqual({
      id: "n1",
      brand_name: "Dolo 650",
      generic_name: "Paracetamol",
      form: "Tablet",
      strength: "650 mg",
      manufacturer: "Micro Labs",
      category_name: "Analgesic",
      dosage: "1 tablet",
      unit_price: 12.5,
      cost_price: null,
      description: null,
      side_effects: null,
      storage_instructions: "Below 30C",
      prescription_required: false,
    })
  })

  it("falls back to an empty generic name, which the legacy type requires", () => {
    expect(toNepalCatalogItem({ ...nepal, genericName: null }).generic_name).toBe("")
  })
})

describe("toSimilarMedicineName", () => {
  it("drops the generic name and sets strength and form to null", () => {
    expect(
      toSimilarMedicineName({ id: "m1", name: "Amoxil", genericName: "Amoxicillin", distance: 2 }),
    ).toEqual({ id: "m1", name: "Amoxil", strength: null, form: null, distance: 2 })
  })
})

describe("toPriceHistoryStatus", () => {
  it("lowercases the C# enum name", () => {
    expect(toPriceHistoryStatus("Scheduled")).toBe("scheduled")
    expect(toPriceHistoryStatus("Superseded")).toBe("superseded")
  })
})

describe("toPriceHistoryRow", () => {
  const dto: DotnetMedicinePriceHistoryDto = {
    id: "h1",
    medicineId: "m1",
    unitPrice: 100,
    costPrice: 80,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    status: "Active",
    reason: "Supplier increase",
    createdAtUtc: "2025-12-20T10:00:00Z",
  }

  it("maps to the legacy row and marks it manual", () => {
    expect(toPriceHistoryRow(dto)).toEqual({
      id: "h1",
      medicine_id: "m1",
      unit_price: 100,
      cost_price: 80,
      effective_from: "2026-01-01",
      effective_to: null,
      status: "active",
      source: "manual",
      reason: "Supplier increase",
      created_at: "2025-12-20T10:00:00Z",
    })
  })
})

describe("request builders", () => {
  it("builds the Nepal search path, omitting q when blank", () => {
    expect(nepalCatalogPath("  para ", 5)).toBe("/api/v1/inventory/medicine-catalog/nepal?q=para&limit=5")
    expect(nepalCatalogPath("   ")).toBe("/api/v1/inventory/medicine-catalog/nepal?limit=10")
  })

  it("builds the similar-names path with an optional excludeId", () => {
    expect(similarNamesPath("Amoxil")).toBe("/api/v1/inventory/medicines/similar-names?name=Amoxil")
    expect(similarNamesPath("Amoxil", "m1")).toBe("/api/v1/inventory/medicines/similar-names?name=Amoxil&excludeId=m1")
  })

  it("maps the schedule input to the .NET body and defaults optional fields to null", () => {
    expect(priceScheduleBody({ unit_price: 50, effective_from: "2026-02-01" })).toEqual({
      unitPrice: 50,
      effectiveFrom: "2026-02-01",
      costPrice: null,
      reason: null,
    })
  })
})
