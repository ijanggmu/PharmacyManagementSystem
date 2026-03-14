"use client"

// Lightweight IndexedDB-based offline sales queue for POS

const DB_NAME = "pms-offline"
const DB_VERSION = 1
const STORE_NAME = "offlineSales"

export type OfflineSaleStatus = "pending" | "synced" | "failed"

export interface OfflineSaleRecord {
  id?: number
  createdAt: string
  payload: any
  status: OfflineSaleStatus
  lastError?: string
}

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
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

export async function enqueueOfflineSale(payload: any) {
  if (!isBrowser()) return
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  const store = tx.objectStore(STORE_NAME)

  const record: OfflineSaleRecord = {
    createdAt: new Date().toISOString(),
    payload,
    status: "pending",
  }

  store.add(record)
}

export async function getPendingOfflineSales(): Promise<OfflineSaleRecord[]> {
  if (!isBrowser()) return []
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => {
      const all = (request.result || []) as OfflineSaleRecord[]
      resolve(all.filter((r) => r.status === "pending"))
    }
    request.onerror = () => reject(request.error || new Error("Failed to read offline sales"))
  })
}

export async function updateOfflineSaleStatus(id: number, status: OfflineSaleStatus, error?: string) {
  if (!isBrowser()) return
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  const store = tx.objectStore(STORE_NAME)

  const existing = await new Promise<OfflineSaleRecord | undefined>((resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result as OfflineSaleRecord | undefined)
    request.onerror = () => reject(request.error || new Error("Failed to load offline sale"))
  })

  if (!existing) return

  existing.status = status
  if (error) {
    existing.lastError = error
  }

  store.put(existing)
}

export async function clearOfflineSale(id: number) {
  if (!isBrowser()) return
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  const store = tx.objectStore(STORE_NAME)
  store.delete(id)
}

