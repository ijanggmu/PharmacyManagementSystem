"use client"

// Lightweight IndexedDB-based offline sales queue for POS.
//
// A record holds the exact checkout body (CreateSaleData) and the Idempotency-Key of the online attempt
// that could not be confirmed, so a sync either replays the sale the server already recorded or creates
// it exactly once. Retry/backoff state lives on the record (see offline-sale-retry.ts).

import type { CreateSaleData } from "@/features/sales/api-client"
import { firstAttemptAt } from "@/lib/offline/offline-sale-retry"

const DB_NAME = "pms-offline"
const DB_VERSION = 1
const STORE_NAME = "offlineSales"

/** pending = waiting for (another) sync attempt; failed = rejected by the server, needs attention. */
export type OfflineSaleStatus = "pending" | "synced" | "failed"

/** Shape written by older builds (before the full checkout body was queued). */
export interface LegacyOfflineSalePayload {
  customer_id?: string
  prescription_id?: string
  payments?: { method: string; amount: number; reference?: string | null }[]
  discount_amount?: number
  notes?: string
  client_request_id?: string
  redeem_loyalty_points?: number
  override_credit_limit?: boolean
  items?: { medicine_id: string; quantity: number; unit_price?: number; discount?: number }[]
}

export interface OfflineSaleRecord {
  id?: number
  createdAt: string
  /** 2 = payload is a CreateSaleData; absent = legacy payload. */
  version?: 2
  payload: CreateSaleData | LegacyOfflineSalePayload
  /** The key the original online attempt used; sent on every sync attempt. */
  idempotencyKey?: string
  status: OfflineSaleStatus
  attempts?: number
  nextAttemptAt?: string | null
  lastError?: string
}

/** Fired on window whenever the queue changes, so every mounted hook refreshes its counts. */
export const OFFLINE_SALES_CHANGED_EVENT = "pms-offline-sales-changed"

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_SALES_CHANGED_EVENT))
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB not available"))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"))
  })
}

function completion(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error("Offline sales write failed"))
    tx.onabort = () => reject(tx.error || new Error("Offline sales write aborted"))
  })
}

/**
 * Queues a checkout whose outcome is unknown (no response / timeout / 5xx). `idempotencyKey` MUST be the
 * key the online attempt used, so the server can't record it twice.
 */
export async function enqueueOfflineSale(payload: CreateSaleData, idempotencyKey: string) {
  if (!isBrowser()) throw new Error("Offline queue is not available in this browser")
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  tx.objectStore(STORE_NAME).add(buildOfflineSaleRecord(payload, idempotencyKey))
  await completion(tx)
  notifyChanged()
}

/**
 * The queued record for a checkout whose outcome is unknown. The first replay is scheduled no sooner than
 * FIRST_ATTEMPT_DELAY_MS (the timed-out request may still land), and every replay sends `idempotencyKey`.
 */
export function buildOfflineSaleRecord(payload: CreateSaleData, idempotencyKey: string, now: Date = new Date()): OfflineSaleRecord {
  return {
    createdAt: now.toISOString(),
    version: 2,
    payload: { ...payload, idempotency_key: idempotencyKey },
    idempotencyKey,
    status: "pending",
    attempts: 0,
    nextAttemptAt: firstAttemptAt(now),
  }
}

/** Every record still to deal with (pending and failed). Synced records are deleted. */
export async function getOfflineSales(): Promise<OfflineSaleRecord[]> {
  if (!isBrowser()) return []
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => {
      const all = (request.result || []) as OfflineSaleRecord[]
      resolve(all.filter((r) => r.status === "pending" || r.status === "failed"))
    }
    request.onerror = () => reject(request.error || new Error("Failed to read offline sales"))
  })
}

/** Pending records only (what will auto-sync). */
export async function getPendingOfflineSales(): Promise<OfflineSaleRecord[]> {
  return (await getOfflineSales()).filter((r) => r.status === "pending")
}

/** Replaces a record (retry state, status). */
export async function putOfflineSale(record: OfflineSaleRecord) {
  if (!isBrowser() || record.id === undefined) return
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  tx.objectStore(STORE_NAME).put(record)
  await completion(tx)
  notifyChanged()
}

export async function clearOfflineSale(id: number) {
  if (!isBrowser()) return
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  tx.objectStore(STORE_NAME).delete(id)
  await completion(tx)
  notifyChanged()
}
