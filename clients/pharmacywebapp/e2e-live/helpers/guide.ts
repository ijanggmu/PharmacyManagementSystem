import fs from "node:fs"
import path from "node:path"
import { expect, type Page, type TestInfo } from "@playwright/test"

/**
 * On-screen guide + findings log for the e2e-live walkthroughs.
 *
 * - `guide.step(...)` shows a caption box (step number, title, explanation) on the page and holds it long enough
 *   to read in the video; it survives navigations because it is re-injected on every page load.
 * - `guide.check(...)` asserts like expect, but a failure is recorded as a finding (with a screenshot and the
 *   video timestamp) and the flow carries on. Findings land in e2e-live/.run/findings.json.
 */

const RUN_DIR = path.join(__dirname, "..", ".run")
const FINDINGS_FILE = path.join(RUN_DIR, "findings.json")
const VIDEO_DIR = path.join(__dirname, "..", "videos")

export type Severity = "blocker" | "major" | "minor" | "cosmetic"

export interface Finding {
  id: string
  flow: string
  step: string
  severity: Severity
  title: string
  expected: string
  actual: string
  screenshot: string | null
  videoTime: string
  url: string
  at: string
}

function readFindings(): Finding[] {
  try {
    return JSON.parse(fs.readFileSync(FINDINGS_FILE, "utf8")) as Finding[]
  } catch {
    return []
  }
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

const CAPTION_SCRIPT = `(() => {
  if (window.__guideInstalled) return; window.__guideInstalled = true;
  const paint = () => {
    const data = window.__guideCaption; let box = document.getElementById("__guide");
    if (!data) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement("div"); box.id = "__guide";
      box.setAttribute("aria-hidden", "true");
      box.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:820px;width:calc(100% - 48px);background:rgba(15,23,42,.94);color:#fff;border-radius:14px;padding:14px 18px;font:15px/1.45 system-ui,Segoe UI,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35);pointer-events:none;border-left:6px solid #14b8a6";
      (document.body || document.documentElement).appendChild(box);
    }
    if (data.mini) {
      // While the step's actions run: a small pill at the top, so it never covers what is being clicked.
      box.style.cssText = "position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:2147483647;background:rgba(15,23,42,.92);color:#fff;border-radius:999px;padding:5px 14px;font:13px/1.3 system-ui,Segoe UI,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.3);pointer-events:none;border:2px solid #14b8a6;white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis";
      box.innerHTML = '<b style="color:#5eead4">' + data.counter + '</b> · ' + data.title;
      return;
    }
    box.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:820px;width:calc(100% - 48px);background:rgba(15,23,42,.94);color:#fff;border-radius:14px;padding:14px 18px;font:15px/1.45 system-ui,Segoe UI,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35);pointer-events:none;border-left:6px solid #14b8a6";
    box.innerHTML = '<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#5eead4;font-weight:700">' + data.flow + ' · ' + data.counter + '</div>'
      + '<div style="font-size:18px;font-weight:700;margin-top:2px">' + data.title + '</div>'
      + (data.detail ? '<div style="margin-top:4px;color:#cbd5e1">' + data.detail + '</div>' : '');
  };
  window.__guidePaint = paint;
  new MutationObserver(() => { if (window.__guideCaption && !document.getElementById("__guide")) paint(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  paint();
})();`

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)
}

export class Guide {
  private stepNo = 0
  private current = "start"
  private readonly started = Date.now()

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
    readonly flow: string,
    private readonly totalSteps: number,
  ) {}

  /**
   * Installs the caption overlay on every page this flow opens. Each flow runs in a fresh browser, so the
   * first-run welcome tour and per-page tips would pop up every time; they are dismissed automatically unless
   * the flow shows them on purpose (`tours: true`, then call `autoDismissTours()` afterwards).
   */
  async install(opts: { tours?: boolean } = {}): Promise<void> {
    await this.page.addInitScript(CAPTION_SCRIPT)
    if (!opts.tours) await this.autoDismissTours()
  }

  async autoDismissTours(): Promise<void> {
    for (const name of ["Skip tour", "Turn off tips"]) {
      await this.page.addLocatorHandler(this.page.getByRole("button", { name, exact: true }), async (button) => {
        await button.click()
      })
    }
  }

  /** Shows the next step's caption and holds it so it can be read in the video. */
  async step(title: string, detail = "", holdMs = 2200): Promise<void> {
    this.stepNo += 1
    this.current = `${this.stepNo}. ${title}`
    const caption = {
      flow: escapeHtml(this.flow),
      counter: `Step ${this.stepNo} of ${this.totalSteps}`,
      title: escapeHtml(title),
      detail: escapeHtml(detail),
      mini: false,
    }
    // Full caption while it is read, then the small pill for the actions that follow.
    await this.show(caption)
    await this.page.waitForTimeout(holdMs)
    await this.show({ ...caption, mini: true })
  }

  private async show(caption: Record<string, unknown>): Promise<void> {
    // Re-applied on every later navigation of this page (init scripts run in order; the last one wins).
    await this.page.addInitScript((c) => {
      ;(window as unknown as { __guideCaption: unknown }).__guideCaption = c
    }, caption)
    await this.page
      .evaluate((c) => {
        const w = window as unknown as { __guideCaption: unknown; __guidePaint?: () => void }
        w.__guideCaption = c
        w.__guidePaint?.()
      }, caption)
      .catch(() => undefined)
  }

  /** A short pause on the result so the viewer sees it. */
  async pause(ms = 1500): Promise<void> {
    await this.page.waitForTimeout(ms)
  }

  /**
   * Like an assertion, but a failure becomes a finding and the flow continues. Returns whether it passed.
   */
  async check(
    title: string,
    fn: () => Promise<unknown>,
    opts: { severity?: Severity; expected?: string } = {},
  ): Promise<boolean> {
    try {
      await fn()
      return true
    } catch (error) {
      await this.finding({
        severity: opts.severity ?? "major",
        title,
        expected: opts.expected ?? title,
        // Playwright messages carry terminal colour codes; strip them for the findings file.
        // eslint-disable-next-line no-control-regex
        actual: (error instanceof Error ? error.message.split("\n").slice(0, 4).join(" ") : String(error)).replace(/\u001b\[[0-9;]*m/g, ""),
      })
      return false
    }
  }

  /** Records a problem seen during the flow (also usable directly when a check is not an assertion). */
  async finding(f: { severity: Severity; title: string; expected: string; actual: string }): Promise<void> {
    fs.mkdirSync(path.join(RUN_DIR, "findings"), { recursive: true })
    const all = readFindings()
    const id = `F-${String(all.length + 1).padStart(3, "0")}`
    const shotPath = path.join(RUN_DIR, "findings", `${id}.png`)
    let screenshot: string | null = null
    try {
      await this.page.screenshot({ path: shotPath })
      screenshot = path.relative(path.join(__dirname, ".."), shotPath)
    } catch {
      screenshot = null
    }
    all.push({
      id,
      flow: this.flow,
      step: this.current,
      ...f,
      screenshot,
      videoTime: mmss(Date.now() - this.started),
      url: this.page.url(),
      at: new Date().toISOString(),
    })
    fs.writeFileSync(FINDINGS_FILE, JSON.stringify(all, null, 2))
    this.testInfo.annotations.push({ type: "finding", description: `${id} [${f.severity}] ${f.title}` })
  }

  /** Clears the caption and copies the recorded video to e2e-live/videos/<file>.webm. */
  async finish(fileBase: string): Promise<void> {
    await this.step("Done", "This flow is complete.", 1800)
    await this.page.evaluate(() => {
      const w = window as unknown as { __guideCaption: unknown; __guidePaint?: () => void }
      w.__guideCaption = null
      w.__guidePaint?.()
    }).catch(() => undefined)
    const video = this.page.video()
    if (!video) return
    fs.mkdirSync(VIDEO_DIR, { recursive: true })
    const target = path.join(VIDEO_DIR, `${fileBase}.webm`)
    this.testInfo.attach("video-path", { body: target })
    await this.page.context().close()
    await video.saveAs(target).catch(() => undefined)
  }
}

export { expect }
