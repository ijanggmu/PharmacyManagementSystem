import { describe, expect, it } from "vitest"
import {
  buildCreateRefundBody,
  buildCreateReturnBody,
  buildRefundsListQuery,
  buildReturnsListQuery,
  buildSalesListQuery,
  buildUpdateRefundBody,
  buildUpdateReturnBody,
  canListRefundsOnDotnet,
  canListReturnsOnDotnet,
  canListSalesOnDotnet,
  displayNumber,
  toCustomerRef,
  toMoney,
  toRefund,
  toReturn,
  toReturnsStats,
  toSale,
  toUtcDateTime,
  type DotnetSaleDto,
  type DotnetSaleRefundDto,
  type DotnetSaleReturnDto,
} from "@/lib/api/sales-api"
import type { CreateRefundData, UpdateRefundData } from "@/features/refunds/api-client"
import type { CreateReturnData, UpdateReturnData } from "@/features/returns/api-client"

const SALE_ID = "3f2a9c1e-1111-4222-8333-444455556666"
const CUSTOMER_ID = "aaaaaaaa-1111-4222-8333-444455556666"
const MEDICINE_ID = "bbbbbbbb-1111-4222-8333-444455556666"
const SALE_ITEM_ID = "cccccccc-1111-4222-8333-444455556666"

const saleDto: DotnetSaleDto = {
  id: SALE_ID,
  customerId: CUSTOMER_ID,
  customerName: "Asha Kumari Thapa",
  saleDateUtc: "2026-10-05T06:00:00Z",
  status: "Completed",
  paymentMethod: "Cash",
  paymentAmount: 500,
  totalAmount: 420.5,
  balanceDue: 0,
  prescriptionId: null,
  notes: "walk-in",
  createdAtUtc: "2026-10-05T06:00:01Z",
  cancelledAtUtc: null,
  cancelReason: null,
  items: [
    {
      id: SALE_ITEM_ID,
      medicineId: MEDICINE_ID,
      medicineName: "Paracetamol 500mg",
      quantity: 2,
      unitPrice: 210.25,
      discountAmount: 5,
      unitCostPrice: 150,
      lineTotal: 420.5,
    },
  ],
}

const returnDto: DotnetSaleReturnDto = {
  id: "dddddddd-1111-4222-8333-444455556666",
  saleId: SALE_ID,
  customerId: null,
  returnDateUtc: "2026-10-06T00:00:00Z",
  status: "Completed",
  returnReason: "Wrong item",
  notes: null,
  totalReturnAmount: 210.25,
  createdAtUtc: "2026-10-06T04:00:00Z",
  stockRestoredAtUtc: "2026-10-06T04:00:01Z",
  items: [
    {
      id: "eeeeeeee-1111-4222-8333-444455556666",
      saleItemId: SALE_ITEM_ID,
      medicineId: MEDICINE_ID,
      medicineName: null,
      quantityReturned: 1,
      unitPrice: 210.25,
      totalAmount: 210.25,
      reason: "Wrong item",
      packagingCondition: "Sealed",
    },
  ],
}

const refundDto: DotnetSaleRefundDto = {
  id: "ffffffff-1111-4222-8333-444455556666",
  originalSaleId: SALE_ID,
  customerId: null,
  refundDateUtc: "2026-10-06T00:00:00Z",
  status: "Pending",
  refundReason: "general_refund",
  refundType: "partial_refund",
  refundMethod: "original_payment",
  refundAmount: 100,
  taxRefundAmount: 0,
  processingFee: 10,
  netRefundAmount: 90,
  refundNumber: "RF-0001",
  creditNoteNumber: null,
  notes: null,
  createdAtUtc: "2026-10-06T05:00:00Z",
  items: [
    {
      id: "11111111-1111-4222-8333-444455556666",
      saleItemId: SALE_ITEM_ID,
      medicineId: MEDICINE_ID,
      medicineName: "Paracetamol 500mg",
      quantityRefunded: 1,
      unitPrice: 210.25,
      totalRefundAmount: 100,
    },
  ],
}

describe("money and labels", () => {
  it("formats money as two decimals", () => {
    expect(toMoney(150)).toBe("150.00")
    expect(toMoney(420.5)).toBe("420.50")
  })

  it("derives a stable display label from the id", () => {
    expect(displayNumber("SALE", SALE_ID)).toBe("SALE-3F2A9C1E")
  })
})

describe("toUtcDateTime", () => {
  it("expands a date to the start of that UTC day", () => {
    expect(toUtcDateTime("2026-10-01")).toBe("2026-10-01T00:00:00Z")
  })

  it("expands a date to the end of that UTC day when asked", () => {
    expect(toUtcDateTime("2026-10-01", true)).toBe("2026-10-01T23:59:59.999Z")
  })

  it("keeps a full timestamp as ISO", () => {
    expect(toUtcDateTime("2026-10-01T05:00:00Z")).toBe("2026-10-01T05:00:00.000Z")
  })
})

describe("toCustomerRef", () => {
  it("splits a single stored name into first and last", () => {
    expect(toCustomerRef(CUSTOMER_ID, "Asha Kumari Thapa")).toEqual({
      id: CUSTOMER_ID,
      first_name: "Asha",
      last_name: "Kumari Thapa",
      phone: null,
      email: null,
    })
  })

  it("leaves the names blank when .NET has none, and returns null without a customer", () => {
    expect(toCustomerRef(CUSTOMER_ID, null)).toMatchObject({ first_name: "", last_name: "" })
    expect(toCustomerRef(null, "Asha")).toBeNull()
  })
})

describe("toSale", () => {
  it("maps a completed sale to the legacy shape", () => {
    const sale = toSale(saleDto)
    expect(sale).toMatchObject({
      id: SALE_ID,
      sale_number: "SALE-3F2A9C1E",
      customer_id: CUSTOMER_ID,
      total_amount: "420.50",
      discount_amount: "5.00",
      tax_amount: "0.00",
      payment_method: "cash",
      payment_status: "paid",
      status: "completed",
      sale_date: "2026-10-05T06:00:00Z",
      notes: "walk-in",
    })
    expect(sale.customers).toEqual({
      id: CUSTOMER_ID,
      first_name: "Asha",
      last_name: "Kumari Thapa",
      phone: null,
      email: null,
    })
    expect(sale.sale_items[0]).toEqual({
      id: SALE_ITEM_ID,
      sale_id: SALE_ID,
      medicine_id: MEDICINE_ID,
      quantity: 2,
      unit_price: "210.25",
      total_price: "420.50",
      medicines: { id: MEDICINE_ID, name: "Paracetamol 500mg", strength: "", form: "" },
    })
    expect(sale.sale_payments).toEqual([{ id: SALE_ID, payment_method: "cash", amount: "500.00" }])
  })

  it("marks a sale with a balance as pending and a cancelled sale as cancelled", () => {
    expect(toSale({ ...saleDto, balanceDue: 50 }).payment_status).toBe("pending")
    const cancelled = toSale({ ...saleDto, status: "Cancelled", cancelReason: "Duplicate", cancelledAtUtc: "2026-10-05T07:00:00Z" })
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.cancellation_reason).toBe("Duplicate")
    expect(cancelled.cancelled_at).toBe("2026-10-05T07:00:00Z")
  })

  it("returns no customer object for a walk-in sale and no medicine for an unnamed line", () => {
    const sale = toSale({
      ...saleDto,
      customerId: null,
      customerName: null,
      items: [{ ...saleDto.items[0], medicineName: null }],
    })
    expect(sale.customers).toBeNull()
    expect(sale.customer_id).toBe("")
    expect(sale.sale_items[0].medicines).toBeNull()
  })
})

describe("toReturn", () => {
  it("maps a completed return with restock and lowercase enums", () => {
    const ret = toReturn(returnDto)
    expect(ret).toMatchObject({
      id: returnDto.id,
      return_number: "RET-DDDDDDDD",
      sale_id: SALE_ID,
      customer_id: "",
      total_return_amount: "210.25",
      status: "completed",
      reason: "Wrong item",
      customers: null,
      sales: { id: SALE_ID, sale_number: "SALE-3F2A9C1E", total_amount: "" },
    })
    expect(ret.return_items[0]).toMatchObject({
      return_id: returnDto.id,
      sale_item_id: SALE_ITEM_ID,
      quantity_returned: 1,
      refund_amount: "210.25",
      packaging_condition: "sealed",
      restocked: true,
    })
  })

  it("reports not restocked while stock has not been restored", () => {
    const ret = toReturn({ ...returnDto, status: "Pending", stockRestoredAtUtc: null })
    expect(ret.status).toBe("pending")
    expect(ret.return_items[0].restocked).toBe(false)
  })
})

describe("toRefund", () => {
  it("maps a refund to the legacy shape, keeping the refund's own number and credit note", () => {
    const refund = toRefund(refundDto)
    expect(refund).toMatchObject({
      id: refundDto.id,
      refund_number: "RF-0001",
      credit_note_number: null,
      original_sale_id: SALE_ID,
      sale_id: SALE_ID,
      refund_amount: "100.00",
      net_refund_amount: "90.00",
      total_refund_amount: "90.00",
      refund_status: "pending",
      status: "pending",
      refund_reason: "general_refund",
      reason: "general_refund",
    })
    expect(refund.refund_items[0]).toMatchObject({
      refund_id: refundDto.id,
      sale_item_id: SALE_ITEM_ID,
      quantity_refunded: 1,
      reason: "general_refund",
      refund_amount: "100.00",
    })
  })
})

describe("toReturnsStats", () => {
  it("passes the stats through unchanged", () => {
    const stats = { total: 4, totalRefundAmount: 300, pending: 1, approved: 1, rejected: 1, completed: 1 }
    expect(toReturnsStats(stats)).toEqual(stats)
  })
})

describe("list filter support", () => {
  it("keeps the sales list on .NET for customer, date and paging filters only", () => {
    expect(canListSalesOnDotnet({ customerId: CUSTOMER_ID, dateFrom: "2026-10-01", page: 2, limit: 20 })).toBe(true)
    expect(canListSalesOnDotnet({ search: "asha" })).toBe(false)
    expect(canListSalesOnDotnet({ paymentStatus: "pending" })).toBe(false)
    expect(canListSalesOnDotnet({ paymentMethods: ["cash"] })).toBe(false)
    expect(canListSalesOnDotnet({ minAmount: 10 })).toBe(false)
    expect(canListSalesOnDotnet({ sortOrder: "asc" })).toBe(false)
    expect(canListSalesOnDotnet({ sortBy: "sale_date", sortOrder: "desc" })).toBe(true)
  })

  it("keeps returns and refunds on .NET unless search or a non-default sort is set", () => {
    expect(canListReturnsOnDotnet({ status: "pending", minAmount: 5 })).toBe(true)
    expect(canListReturnsOnDotnet({ search: "RET" })).toBe(false)
    expect(canListRefundsOnDotnet({ saleId: SALE_ID })).toBe(true)
    expect(canListRefundsOnDotnet({ sortBy: "refund_amount" })).toBe(false)
  })
})

describe("list query builders", () => {
  it("builds the sales query with UTC day bounds and paging", () => {
    const qs = new URLSearchParams(buildSalesListQuery({ customerId: CUSTOMER_ID, dateFrom: "2026-10-01", dateTo: "2026-10-05", page: 3, limit: 25 }))
    expect(qs.get("customerId")).toBe(CUSTOMER_ID)
    expect(qs.get("dateFromUtc")).toBe("2026-10-01T00:00:00Z")
    expect(qs.get("dateToUtc")).toBe("2026-10-05T23:59:59.999Z")
    expect(qs.get("pageNumber")).toBe("3")
    expect(qs.get("pageSize")).toBe("25")
  })

  it("defaults paging to page 1 and 50 rows", () => {
    const qs = new URLSearchParams(buildSalesListQuery({}))
    expect(qs.get("pageNumber")).toBe("1")
    expect(qs.get("pageSize")).toBe("50")
  })

  it("builds the returns and refunds queries with status, sale and amount filters", () => {
    const returns = new URLSearchParams(buildReturnsListQuery({ status: "approved", saleId: SALE_ID, minAmount: 10, maxAmount: 99 }))
    expect(returns.get("status")).toBe("approved")
    expect(returns.get("saleId")).toBe(SALE_ID)
    expect(returns.get("minAmount")).toBe("10")
    expect(returns.get("maxAmount")).toBe("99")
    const refunds = new URLSearchParams(buildRefundsListQuery({ customerId: CUSTOMER_ID, dateFrom: "2026-10-06" }))
    expect(refunds.get("customerId")).toBe(CUSTOMER_ID)
    expect(refunds.get("dateFromUtc")).toBe("2026-10-06T00:00:00Z")
  })
})

describe("payload builders", () => {
  const returnInput: CreateReturnData = {
    sale_id: SALE_ID,
    customer_id: "",
    return_date: "2026-10-06",
    status: "pending",
    reason: "Wrong item",
    notes: "checked",
    return_items: [{ sale_item_id: SALE_ITEM_ID, quantity_returned: 1, reason: "Wrong item" }],
  }

  it("builds a return body with the legacy 'opened' packaging default and no customer", () => {
    expect(buildCreateReturnBody(returnInput)).toEqual({
      saleId: SALE_ID,
      customerId: null,
      returnDateUtc: "2026-10-06T00:00:00Z",
      status: "pending",
      reason: "Wrong item",
      notes: "checked",
      returnItems: [{ saleItemId: SALE_ITEM_ID, quantityReturned: 1, reason: "Wrong item", packagingCondition: "opened" }],
    })
  })

  it("keeps an explicit packaging condition on a return line", () => {
    const body = buildCreateReturnBody({
      ...returnInput,
      return_items: [{ sale_item_id: SALE_ITEM_ID, quantity_returned: 2, reason: "Damaged", packaging_condition: "damaged" }],
    })
    expect(body.returnItems[0].packagingCondition).toBe("damaged")
  })

  const refundInput: CreateRefundData = {
    sale_id: SALE_ID,
    customer_id: CUSTOMER_ID,
    refund_date: "2026-10-06",
    status: "completed",
    tax_refund_amount: 5,
    processing_fee: 10,
    refund_items: [{ sale_item_id: SALE_ITEM_ID, quantity_refunded: 1 }],
  }

  it("builds a refund body with the legacy reason default and money fields", () => {
    expect(buildCreateRefundBody(refundInput)).toEqual({
      originalSaleId: SALE_ID,
      customerId: CUSTOMER_ID,
      refundDateUtc: "2026-10-06T00:00:00Z",
      refundReason: "general_refund",
      status: "completed",
      notes: undefined,
      taxRefundAmount: 5,
      processingFee: 10,
      refundItems: [{ saleItemId: SALE_ITEM_ID, quantityRefunded: 1 }],
    })
  })

  it("defaults the refund status to pending when none is given", () => {
    const body = buildCreateRefundBody({ ...refundInput, status: undefined as unknown as CreateRefundData["status"] })
    expect(body.status).toBe("pending")
  })

  it("sends only the return fields the caller passed", () => {
    const updates: UpdateReturnData = { status: "completed" }
    expect(buildUpdateReturnBody(updates)).toEqual({ status: "completed" })
    expect(buildUpdateReturnBody({ reason: "x", notes: "" })).toEqual({ reason: "x", notes: "" })
  })

  it("maps refund status and reason from either key style", () => {
    const fromShort: UpdateRefundData = { status: "approved", reason: "Duplicate" }
    expect(buildUpdateRefundBody(fromShort)).toEqual({ status: "approved", refundReason: "Duplicate" })
    const fromColumns: UpdateRefundData = { refund_status: "rejected", refund_reason: "Not eligible" }
    expect(buildUpdateRefundBody(fromColumns)).toEqual({ status: "rejected", refundReason: "Not eligible" })
  })
})
