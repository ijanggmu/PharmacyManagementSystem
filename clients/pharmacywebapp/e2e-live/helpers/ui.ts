import fs from "node:fs"
import path from "node:path"
import type { Locator, Page } from "@playwright/test"
import type { Guide } from "./guide"

export const FIXTURES = path.join(__dirname, "..", "fixtures")

/**
 * Runs a file import through the shared import dialog: pick the file, wait for the preview, import, and return
 * the result line ("Imported …"). `file` is a fixture name or an absolute path. Returns null when the import did not finish (the caller records the finding).
 */
export async function importFile(page: Page, guide: Guide, openButton: string, file: string): Promise<string | null> {
  await page.getByRole("button", { name: openButton, exact: true }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.locator('input[type="file"]').setInputFiles(path.isAbsolute(file) ? file : path.join(FIXTURES, file))
  const go = dialog.getByRole("button", { name: /^Import \d+ row/ })
  const ready = await go.waitFor({ timeout: 30_000 }).then(() => true, () => false)
  await guide.pause(2500)
  if (!ready) return null
  await go.click()
  const done = dialog.getByText(/^Imported /).first()
  const finished = await done.waitFor({ timeout: 60_000 }).then(() => true, () => false)
  if (!finished) return null
  const text = await done.innerText()
  await guide.pause(2000)
  await dialog.getByRole("button", { name: "Done" }).click()
  return text
}

/** yyyy-mm-dd, `days` from today (negative for the past). */
export function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Writes a run-specific file (e.g. a CSV with dates relative to today) and returns its absolute path. */
export function writeRunFile(name: string, content: string): string {
  const dir = path.join(__dirname, "..", ".run", "files")
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  fs.writeFileSync(file, content)
  return file
}

/** True if the locator becomes visible within `ms` (unlike isVisible(), which doesn't wait). */
export async function visibleSoon(locator: Locator, ms = 5_000): Promise<boolean> {
  return locator
    .first()
    .waitFor({ state: "visible", timeout: ms })
    .then(() => true, () => false)
}

/**
 * Some documents (Z/X-reports, vouchers) print straight from a hidden iframe with no on-screen preview. This runs
 * `trigger`, grabs the HTML sent to the printer, and returns it (null if nothing was printed).
 */
export async function capturePrint(page: Page, trigger: () => Promise<void>): Promise<string | null> {
  await page.evaluate(() => {
    ;(window as unknown as { __lastPrint?: string }).__lastPrint = undefined
  })
  await trigger()
  return page
    .waitForFunction(
      () => {
        const frames = [...document.querySelectorAll<HTMLIFrameElement>('iframe[aria-hidden="true"][tabindex="-1"]')]
        const html = frames.pop()?.contentDocument?.documentElement?.outerHTML
        if (html && html.length > 200) {
          ;(window as unknown as { __lastPrint?: string }).__lastPrint = html
          return html
        }
        return false
      },
      undefined,
      { polling: 50, timeout: 15_000 },
    )
    .then((handle) => handle.jsonValue() as Promise<string>)
    .catch(() => null)
}

/** Shows a printed document over the page for the video (it never appears on screen otherwise). */
export async function showDocument(page: Page, html: string, ms = 4000): Promise<void> {
  await page.evaluate((doc) => {
    const wrap = document.createElement("div")
    wrap.id = "__printed"
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center"
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:420px;height:80vh;border:0;border-radius:10px;background:#fff;box-shadow:0 20px 50px rgba(0,0,0,.4)"
    frame.srcdoc = doc
    wrap.appendChild(frame)
    document.body.appendChild(wrap)
  }, html)
  await page.waitForTimeout(ms)
  await page.evaluate(() => document.getElementById("__printed")?.remove())
}
