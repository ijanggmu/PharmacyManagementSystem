import { describe, expect, it } from "vitest"
import {
  CATEGORY_PAGE_SIZE,
  categoriesPagePath,
  createCategoryBody,
  nextCategoryPage,
  toMedicineCategory,
} from "@/lib/api/reference-api"

describe("toMedicineCategory", () => {
  it("keeps only id and name, the shape the medicine forms use", () => {
    expect(
      toMedicineCategory({ id: "c1", name: "Antibiotics" }),
    ).toEqual({ id: "c1", name: "Antibiotics" })
  })
})

describe("categoriesPagePath", () => {
  it("requests the given page sorted by name with the default page size", () => {
    expect(categoriesPagePath(2)).toBe(
      `/api/v1/reference/categories?pageNumber=2&pageSize=${CATEGORY_PAGE_SIZE}&sortBy=name&sortDir=asc`,
    )
  })
})

describe("nextCategoryPage", () => {
  it("advances while more pages remain", () => {
    expect(nextCategoryPage({ pageNumber: 1, totalPages: 3 })).toBe(2)
    expect(nextCategoryPage({ pageNumber: 2, totalPages: 3 })).toBe(3)
  })

  it("stops on the last page and for an empty result", () => {
    expect(nextCategoryPage({ pageNumber: 3, totalPages: 3 })).toBeNull()
    expect(nextCategoryPage({ pageNumber: 1, totalPages: 0 })).toBeNull()
  })
})

describe("createCategoryBody", () => {
  it("trims the name before sending", () => {
    expect(createCategoryBody("  Vitamins ")).toEqual({ name: "Vitamins" })
  })
})
