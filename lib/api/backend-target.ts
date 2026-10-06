/**
 * Per-area switch between the .NET API (default) and the legacy Next.js/Supabase path.
 * Every area defaults to "dotnet". Set NEXT_PUBLIC_BACKEND_TARGET_<AREA>=nextjs to roll a single
 * area back to the legacy path. Any other value, including unset, selects "dotnet".
 */

export const BACKEND_AREAS = [
  "AUTH",
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
  "TENANCY",
] as const

export type BackendArea = (typeof BACKEND_AREAS)[number]
export type BackendTarget = "nextjs" | "dotnet"

const TARGET_ENV: Record<BackendArea, string | undefined> = {
  AUTH: process.env.NEXT_PUBLIC_BACKEND_TARGET_AUTH,
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
  TENANCY: process.env.NEXT_PUBLIC_BACKEND_TARGET_TENANCY,
}

/** Resolves an area's target. Only the exact value "nextjs" selects the legacy path; everything else is "dotnet". */
export function backendTarget(area: BackendArea, env: Partial<Record<BackendArea, string | undefined>> = TARGET_ENV): BackendTarget {
  return env[area] === "nextjs" ? "nextjs" : "dotnet"
}

/**
 * Checkout stays on the legacy path until the .NET sale enforces the same safety checks
 * (interaction, allergy, controlled-substance, prescription). Opt in with CHECKOUT_ON_DOTNET=true.
 */
export function checkoutOnDotnet(env: { CHECKOUT_ON_DOTNET?: string } = { CHECKOUT_ON_DOTNET: process.env.NEXT_PUBLIC_CHECKOUT_ON_DOTNET }): boolean {
  return backendTarget("SALES") === "dotnet" && env.CHECKOUT_ON_DOTNET?.trim().toLowerCase() === "true"
}
