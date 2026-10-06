/**
 * Per-area switch between the legacy Next.js/Supabase path and the .NET API.
 * Every area defaults to "nextjs", so shipping this module changes no behaviour.
 * Flip one area at a time with NEXT_PUBLIC_BACKEND_TARGET_<AREA>=dotnet.
 */

export const BACKEND_AREAS = [
  "REPORTS",
  "DASHBOARD",
  "NOTIFICATIONS",
  "REFERENCE",
  "CATALOG",
  "SUPPLIERS",
  "CUSTOMERS",
  "INVENTORY",
  "PURCHASING",
  "SALES",
  "ACCOUNTING",
  "PRESCRIPTIONS",
  "ONBOARDING",
] as const

export type BackendArea = (typeof BACKEND_AREAS)[number]
export type BackendTarget = "nextjs" | "dotnet"

const TARGET_ENV: Record<BackendArea, string | undefined> = {
  REPORTS: process.env.NEXT_PUBLIC_BACKEND_TARGET_REPORTS,
  DASHBOARD: process.env.NEXT_PUBLIC_BACKEND_TARGET_DASHBOARD,
  NOTIFICATIONS: process.env.NEXT_PUBLIC_BACKEND_TARGET_NOTIFICATIONS,
  REFERENCE: process.env.NEXT_PUBLIC_BACKEND_TARGET_REFERENCE,
  CATALOG: process.env.NEXT_PUBLIC_BACKEND_TARGET_CATALOG,
  SUPPLIERS: process.env.NEXT_PUBLIC_BACKEND_TARGET_SUPPLIERS,
  CUSTOMERS: process.env.NEXT_PUBLIC_BACKEND_TARGET_CUSTOMERS,
  INVENTORY: process.env.NEXT_PUBLIC_BACKEND_TARGET_INVENTORY,
  PURCHASING: process.env.NEXT_PUBLIC_BACKEND_TARGET_PURCHASING,
  SALES: process.env.NEXT_PUBLIC_BACKEND_TARGET_SALES,
  ACCOUNTING: process.env.NEXT_PUBLIC_BACKEND_TARGET_ACCOUNTING,
  PRESCRIPTIONS: process.env.NEXT_PUBLIC_BACKEND_TARGET_PRESCRIPTIONS,
  ONBOARDING: process.env.NEXT_PUBLIC_BACKEND_TARGET_ONBOARDING,
}

/** Resolves an area's target. Unknown or missing values fall back to the legacy path. */
export function backendTarget(area: BackendArea, env: Partial<Record<BackendArea, string | undefined>> = TARGET_ENV): BackendTarget {
  return env[area]?.trim().toLowerCase() === "dotnet" ? "dotnet" : "nextjs"
}
