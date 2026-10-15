/**
 * Held ("parked") POS bills — pure helpers, unit-tested.
 *
 * Holding sends the cart to the server (POST /sales/parked), kept per branch so any till there can recall it. It is a
 * note, not a sale: no stock is reserved and nothing is posted. Offline, the bill is kept on this device only
 * (localStorage) and shows in the recall list as "this device".
 *
 * Recalling never trusts the prices stored with the bill: every line is priced again against the medicine's CURRENT
 * lots (and the customer's price level), clamped to the stock on hand now, and the cashier is told what changed.
 */

import type { CartItem, Medicine } from "@/features/sales/types"
import { posPriceLine } from "@/features/sales/lib/pos-pricing"
import { levelPricer, type PriceLevelRule } from "@/features/sales/lib/price-levels"
import {
  effectiveUnit,
  hasBox,
  resolveSaleUnits,
  snapToPacks,
  unitFactor,
  wholePacks,
  type SaleUnit,
} from "@/features/sales/lib/sale-units"

/** ParkedSaleLineDto (camelCase). Quantity is base units. Prices are the till's figures at hold time. */
export interface ParkedLine {
  medicineId: string
  medicineName: string
  quantity: number
  /** "box" lines carry the number of boxes in packCount. */
  saleUnit: "pack" | "box" | null
  packCount: number | null
  discountPercent: number
  unitPrice: number
  lineTotal: number
}

/** Header of a held bill (everything but the lines). */
export interface ParkedBillHeader {
  label?: string
  customerId?: string | null
  customerName?: string | null
  prescriptionId?: string | null
  /** The level the cart was priced at when it differs from the customer's own (see priceLevelIdToSend). */
  priceLevelId?: string | null
  buyerName?: string | null
  buyerPan?: string | null
  billDiscountAmount?: number
  notes?: string | null
}

/** Body of POST /sales/parked (ParkSaleCommand). */
export interface ParkSaleBody extends ParkedBillHeader {
  label: string
  lines: ParkedLine[]
  totalAmount: number
  clientParkId: string
}

/** A held bill as the recall list shows it. */
export interface ParkedBillSummary {
  id: string
  label: string
  customerId: string | null
  customerName: string | null
  lineCount: number
  totalAmount: number
  parkedByName: string | null
  parkedAtUtc: string
  expiresAtUtc: string
  /** "server" = any till at the branch can recall it; "local" = held offline on this device only. */
  source: "server" | "local"
}

/** A held bill with its cart (ParkedSaleDto, or a local one). */
export interface ParkedBill extends ParkedBillSummary {
  prescriptionId: string | null
  priceLevelId: string | null
  buyerName: string | null
  buyerPan: string | null
  billDiscountAmount: number
  notes: string | null
  lines: ParkedLine[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** A label for the bill when the cashier gives none: the customer, else "Bill 14:05". */
export function defaultParkLabel(customerName: string | null | undefined, now: Date = new Date()): string {
  if (customerName?.trim()) return customerName.trim()
  const hh = String(now.getHours()).padStart(2, "0")
  const mm = String(now.getMinutes()).padStart(2, "0")
  return `Bill ${hh}:${mm}`
}

/** The cart as held: base quantities, the pack of whole-pack lines, and the prices the till shows. */
export function buildParkBody(
  cart: CartItem[],
  header: ParkedBillHeader,
  totalAmount: number,
  clientParkId: string,
  now: Date = new Date(),
): ParkSaleBody {
  return {
    ...header,
    label: header.label?.trim() || defaultParkLabel(header.customerName, now),
    billDiscountAmount: round2(Math.max(0, header.billDiscountAmount ?? 0)),
    totalAmount: round2(totalAmount),
    clientParkId,
    lines: cart.map((item) => {
      const unit = effectiveUnit(item.saleUnit, item.packUnits)
      return {
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        quantity: item.quantity,
        saleUnit: unit === "base" ? null : unit,
        packCount: unit === "base" ? null : wholePacks(item.quantity, unitFactor(unit, item.packUnits)),
        discountPercent: item.discountPercent,
        unitPrice: round2(item.unitPrice),
        lineTotal: round2(item.totalPrice),
      }
    }),
  }
}

export interface RestoredCart {
  cart: CartItem[]
  /** What changed since the bill was held, one sentence each, for the cashier. */
  warnings: string[]
}

/** Builds a priced cart line for `medicine` (same shape addToCart makes). */
export function cartLineFor(
  medicine: Medicine,
  quantity: number,
  saleUnit: SaleUnit,
  discountPercent: number,
  priceLevel: PriceLevelRule | null,
): CartItem {
  const packUnits = resolveSaleUnits(medicine)
  const fefoPicks = medicine.fefo_picks ?? []
  const catalogPrice = Number.parseFloat(String(medicine.unit_price)) || 0
  const priced = posPriceLine(fefoPicks, catalogPrice, quantity, discountPercent, levelPricer(priceLevel, medicine.id))
  return {
    medicineId: medicine.id,
    medicineName: medicine.name,
    strength: medicine.strength,
    form: medicine.form,
    quantity,
    availableStock: medicine.stock_quantity,
    discountPercent,
    isTaxable: medicine.is_taxable !== false,
    fefoPicks,
    batchTracked: (medicine.batch_count ?? 0) > 0 || fefoPicks.length > 0,
    catalogPrice,
    packUnits,
    saleUnit: packUnits ? saleUnit : "base",
    unitPrice: priced.unitPrice,
    totalPrice: priced.totalPrice,
    mixedPrices: priced.mixedPrices,
    unpricedBatch: priced.unpricedBatch,
  }
}

const money = (n: number) => `Rs ${n.toFixed(2)}`

/**
 * The held lines as a cart priced NOW: a medicine no longer in stock is dropped, a quantity above today's stock is
 * cut down (to whole packs for a pack line), and every line is priced against today's lots at `priceLevel`.
 */
export function restoreParkedCart(
  lines: ParkedLine[],
  medicines: Medicine[],
  priceLevel: PriceLevelRule | null,
): RestoredCart {
  const byId = new Map(medicines.map((m) => [m.id, m]))
  const cart: CartItem[] = []
  const warnings: string[] = []

  for (const line of lines) {
    const medicine = byId.get(line.medicineId)
    if (!medicine || medicine.stock_quantity <= 0) {
      warnings.push(`${line.medicineName} is out of stock and was left out.`)
      continue
    }
    if (cart.some((c) => c.medicineId === line.medicineId)) continue

    const packUnits = resolveSaleUnits(medicine)
    const heldUnit: SaleUnit = line.saleUnit ?? "base"
    let unit: SaleUnit = effectiveUnit(heldUnit, packUnits)
    let quantity = line.quantity
    if ((heldUnit === "box" && !hasBox(packUnits)) || (unit !== "base" && quantity % unitFactor(unit, packUnits) !== 0)) {
      // The pack or box size changed since the bill was held: sell the same base quantity in units.
      warnings.push(
        heldUnit === "box"
          ? `${medicine.name}: the box size changed, so it is back in single units.`
          : `${medicine.name}: the pack size changed, so it is back in single units.`,
      )
      unit = "base"
    }
    if (quantity > medicine.stock_quantity) {
      quantity = unit !== "base" ? snapToPacks(medicine.stock_quantity, unitFactor(unit, packUnits), medicine.stock_quantity) : medicine.stock_quantity
      if (quantity <= 0) {
        unit = "base"
        quantity = medicine.stock_quantity
      }
      warnings.push(`${medicine.name}: only ${quantity} left in stock, so the quantity was reduced from ${line.quantity}.`)
    }

    const item = cartLineFor(medicine, quantity, unit, line.discountPercent, priceLevel)
    if (Math.abs(item.unitPrice - line.unitPrice) >= 0.005 && line.unitPrice > 0) {
      warnings.push(`${medicine.name}: price changed from ${money(line.unitPrice)} to ${money(item.unitPrice)} a unit.`)
    }
    cart.push(item)
  }

  return { cart, warnings }
}

// ---------------------------------------------------------------------------
// Bills held offline on this device (localStorage)
// ---------------------------------------------------------------------------

export const LOCAL_PARKED_KEY = "pharmacare.pos.held-bills.v1"
export const DEFAULT_PARK_HOURS = 24

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

interface LocalParked extends ParkedBill {
  branchId: string | null
}

function readLocal(store: StorageLike | null): LocalParked[] {
  if (!store) return []
  try {
    const parsed: unknown = JSON.parse(store.getItem(LOCAL_PARKED_KEY) ?? "[]")
    return Array.isArray(parsed) ? (parsed as LocalParked[]) : []
  } catch {
    return []
  }
}

function writeLocal(store: StorageLike | null, bills: LocalParked[]): boolean {
  if (!store) return false
  try {
    store.setItem(LOCAL_PARKED_KEY, JSON.stringify(bills))
    return true
  } catch {
    return false
  }
}

/** Holds a bill on this device only (offline). Returns it, or null when the browser storage is unavailable. */
export function parkLocally(
  body: ParkSaleBody,
  branchId: string | null,
  now: Date = new Date(),
  hours = DEFAULT_PARK_HOURS,
  store: StorageLike | null = storage(),
): ParkedBill | null {
  const bill: LocalParked = {
    id: `local-${body.clientParkId}`,
    label: body.label,
    customerId: body.customerId ?? null,
    customerName: body.customerName ?? null,
    lineCount: body.lines.length,
    totalAmount: body.totalAmount,
    parkedByName: null,
    parkedAtUtc: now.toISOString(),
    expiresAtUtc: new Date(now.getTime() + hours * 3_600_000).toISOString(),
    source: "local",
    prescriptionId: body.prescriptionId ?? null,
    priceLevelId: body.priceLevelId ?? null,
    buyerName: body.buyerName ?? null,
    buyerPan: body.buyerPan ?? null,
    billDiscountAmount: body.billDiscountAmount ?? 0,
    notes: body.notes ?? null,
    lines: body.lines,
    branchId,
  }
  const kept = readLocal(store).filter((b) => new Date(b.expiresAtUtc) > now)
  return writeLocal(store, [bill, ...kept]) ? bill : null
}

/** This device's held bills for the branch that have not expired, newest first. */
export function listLocalParked(branchId: string | null, now: Date = new Date(), store: StorageLike | null = storage()): ParkedBill[] {
  return readLocal(store)
    .filter((b) => (b.branchId ?? null) === (branchId ?? null) && new Date(b.expiresAtUtc) > now)
    .sort((a, b) => b.parkedAtUtc.localeCompare(a.parkedAtUtc))
}

/** Takes a local bill off hold (recall or discard). */
export function removeLocalParked(id: string, store: StorageLike | null = storage()): ParkedBill | null {
  const bills = readLocal(store)
  const found = bills.find((b) => b.id === id) ?? null
  if (found) writeLocal(store, bills.filter((b) => b.id !== id))
  return found
}
