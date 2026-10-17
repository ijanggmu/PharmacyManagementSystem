import fs from "node:fs"
import path from "node:path"
import type { Page } from "@playwright/test"

/**
 * The pharmacy a run works in. 00-create-pharmacy signs one up and writes it here; every later flow reads it,
 * so all flows of one run share the same fresh data. Delete e2e-live/.run/state.json to start over.
 */
export interface RunState {
  /** Tenant id the sign-up returned (also the "pharmacy code" staff sign in with). */
  tenant: string
  pharmacyName: string
  ownerEmail: string
  ownerPassword: string
  ownerFirstName: string
  ownerLastName: string
  createdAt: string
  /** Free-form values one flow leaves for the next (e.g. staff accounts, supplier names). */
  extra: Record<string, unknown>
}

const STATE_FILE = path.join(__dirname, "..", ".run", "state.json")

export function readState(): RunState {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error("No pharmacy for this run yet — run 00-create-pharmacy first (e2e-live/.run/state.json is missing).")
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as RunState
}

export function writeState(state: RunState): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

export function updateExtra(values: Record<string, unknown>): void {
  const state = readState()
  writeState({ ...state, extra: { ...state.extra, ...values } })
}

/** Unique, readable stamp for names in this run, e.g. 1016-1904. */
export function runStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

/**
 * Signs in through the real sign-in dialog (pharmacy code + email + password). Clears any autofill first.
 */
export async function signIn(page: Page, tenant: string, email: string, password: string): Promise<void> {
  await page.goto("/dashboard")
  const dialog = page.getByRole("dialog")
  await dialog.waitFor()
  const codeToggle = dialog.getByRole("button", { name: "Have a pharmacy code?" })
  if (await codeToggle.isVisible().catch(() => false)) await codeToggle.click()
  await dialog.getByLabel(/Pharmacy code/).fill(tenant)
  await dialog.getByRole("textbox", { name: "Email" }).fill(email)
  await dialog.getByLabel("Password", { exact: true }).fill(password)
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.getByRole("heading", { name: "Dashboard", level: 1 }).waitFor({ timeout: 120_000 })
}
