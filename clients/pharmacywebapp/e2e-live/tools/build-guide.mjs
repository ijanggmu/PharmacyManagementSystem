// Builds the owner's guide (PDF) from a guided e2e-live run.
//
//   node e2e-live/tools/build-guide.mjs --out "C:\path\PharmaCare-Guide.pdf" [--issues issues.json]
//
// Reads e2e-live/.run/steps.jsonl (one line per guided step, written by helpers/guide.ts) and the step
// screenshots, groups the flows into chapters by who does the work, and prints an A4 PDF with Chromium.
// --issues: optional JSON array of { id, severity, title, status } shown as a "Known issues" appendix.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { chromium } from "@playwright/test"

const here = path.dirname(fileURLToPath(import.meta.url))
const RUN = path.join(here, "..", ".run")
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const out = arg("out") ?? path.join(RUN, "PharmaCare-Guide.pdf")
const issuesFile = arg("issues")

/** Chapters, in reading order. Each flow is listed once, under the person who mostly does it. */
const CHAPTERS = [
  { title: "Getting started (owner)", who: "Owner", intro: "Create your pharmacy, fill in its details, add branches and staff, and bring in what you already have.", flows: ["00", "01", "02", "03", "07"] },
  { title: "Medicines, suppliers and customers", who: "Owner / Manager / Pharmacist", intro: "The lists everything else uses: the medicines you sell, who you buy from, and who buys on credit.", flows: ["04", "05", "06"] },
  { title: "The counter (cashier & pharmacist)", who: "Cashier / Pharmacist", intro: "A normal day at the counter: open the cash drawer, sell, handle prescriptions, returns and refunds, take credit payments, and close the drawer.", flows: ["08", "09", "10", "11", "12", "13", "14"] },
  { title: "Buying and stock (store keeper)", who: "Manager / Store keeper", intro: "Order from suppliers, receive the goods, pay and return to suppliers, and keep the stock count right across branches.", flows: ["15", "16", "17", "18", "19", "20", "21", "22"] },
  { title: "Money, staff pay and tax (accountant)", who: "Owner / Accountant", intro: "Shop expenses, staff salaries, the books, VAT and IRD, and the reports the owner reads.", flows: ["23", "24", "25", "26", "27"] },
  { title: "People, permissions and help", who: "Everyone", intro: "What each role can and cannot do, your own profile and language, and how to ask for help.", flows: ["28", "29"] },
  { title: "Platform admin (PharmaCare team only)", who: "Super-admin", intro: "For the people who run PharmaCare itself, not for pharmacies.", flows: ["30"] },
]

const ROLES = [
  ["Owner", "Everything: settings, staff, prices, reports, money. Signs up the pharmacy."],
  ["Manager", "Runs the shop day to day: stock, suppliers, purchases, staff schedules. Sees reports."],
  ["Pharmacist", "Sells and dispenses, checks prescriptions, keeps the narcotics register, watches expiry."],
  ["Cashier", "Sells at the counter, takes payments, opens and closes the cash drawer. No profit or accounts."],
  ["Accountant", "Expenses, supplier and customer payments, the books, VAT/IRD and payroll."],
]

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

const steps = fs
  .readFileSync(path.join(RUN, "steps.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((s) => s.title !== "Done")

/** flow number ("09") -> { name, steps[] } keeping the last run of each flow only. */
const flows = new Map()
for (const s of steps) {
  const no = s.flow.slice(0, 2)
  if (!flows.has(no) || (s.step === 1 && flows.get(no).steps.length)) flows.set(no, { name: s.flow, steps: [] })
  flows.get(no).steps.push(s)
}

// Smaller JPEGs keep the PDF a sensible size.
const IMG = path.join(RUN, "guide-img")
fs.mkdirSync(IMG, { recursive: true })
function jpeg(rel) {
  const src = path.join(RUN, rel)
  if (!fs.existsSync(src)) return null
  const dst = path.join(IMG, rel.replace(/[\\/]/g, "_").replace(/\.png$/, ".jpg"))
  if (!fs.existsSync(dst)) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", "scale=1200:-1", "-q:v", "4", dst])
  return pathToFileURL(dst).href
}

const state = fs.existsSync(path.join(RUN, "state.json")) ? JSON.parse(fs.readFileSync(path.join(RUN, "state.json"), "utf8")) : {}
const issues = issuesFile ? JSON.parse(fs.readFileSync(issuesFile, "utf8")) : []

let toc = ""
let body = ""
CHAPTERS.forEach((ch, ci) => {
  const present = ch.flows.filter((f) => flows.has(f))
  if (!present.length) return
  toc += `<li><b>${ci + 1}. ${esc(ch.title)}</b><ul>${present.map((f) => `<li>${esc(flows.get(f).name)}</li>`).join("")}</ul></li>`
  body += `<section class="chapter"><div class="kicker">Chapter ${ci + 1} · ${esc(ch.who)}</div><h1>${esc(ch.title)}</h1><p class="lead">${esc(ch.intro)}</p></section>`
  for (const f of present) {
    const flow = flows.get(f)
    body += `<section class="flow"><h2>${esc(flow.name)}</h2>`
    for (const s of flow.steps) {
      const img = s.screenshot ? jpeg(s.screenshot) : null
      body += `<div class="step"><div class="num">${s.step}</div><div><h3>${esc(s.title)}</h3>${s.detail ? `<p>${esc(s.detail)}</p>` : ""}${img ? `<img src="${img}">` : ""}</div></div>`
    }
    body += `</section>`
  }
})

const issuesHtml = issues.length
  ? `<section class="chapter"><h1>Known issues</h1><p class="lead">Problems found while making this guide, and whether they are fixed yet.</p><table><tr><th>ID</th><th>How bad</th><th>What happens</th><th>Status</th></tr>${issues
      .map((i) => `<tr><td>${esc(i.id)}</td><td>${esc(i.severity)}</td><td>${esc(i.title)}</td><td>${esc(i.status)}</td></tr>`)
      .join("")}</table></section>`
  : ""

const html = `<!doctype html><html><head><meta charset="utf-8"><title>PharmaCare guide</title><style>
@page { size: A4; margin: 16mm 14mm; }
body { font-family: "Segoe UI", "Nirmala UI", "Noto Sans Devanagari", system-ui, sans-serif; color: #0f172a; font-size: 11pt; line-height: 1.45; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
.cover h1 { font-size: 34pt; margin: 0; color: #0f766e; } .cover p { font-size: 13pt; color: #334155; max-width: 140mm; }
.kicker { color: #0f766e; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-size: 9pt; }
.chapter { page-break-before: always; } .chapter h1 { font-size: 22pt; margin: 4px 0 8px; } .lead { font-size: 12pt; color: #334155; }
.flow { page-break-before: always; } .flow h2 { font-size: 16pt; border-bottom: 3px solid #14b8a6; padding-bottom: 4px; }
.step { display: grid; grid-template-columns: 26px 1fr; gap: 10px; margin: 12px 0 16px; page-break-inside: avoid; }
.num { width: 24px; height: 24px; border-radius: 50%; background: #0f766e; color: #fff; font-weight: 700; display: grid; place-items: center; font-size: 10pt; }
.step h3 { margin: 1px 0 2px; font-size: 12pt; } .step p { margin: 0 0 6px; color: #334155; }
.step img { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; }
table { border-collapse: collapse; width: 100%; font-size: 10pt; } td, th { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; } th { background: #f1f5f9; }
.toc ul { margin: 2px 0 8px; } .toc > li { margin-top: 6px; }
</style></head><body>
<section class="cover"><div class="kicker">PharmaCare · ${esc(new Date().toISOString().slice(0, 10))}</div><h1>Running your pharmacy on PharmaCare</h1>
<p>A step-by-step guide for pharmacy owners and staff. Every picture comes from a real run of the live app, using the example pharmacy “${esc(state.pharmacyName ?? "QA Flow Pharmacy")}”.</p></section>
<section><h1>Who does what</h1><p class="lead">Give each person only the role they need. You can change a role any time under Staff.</p>
<table><tr><th>Role</th><th>What they do</th></tr>${ROLES.map(([r, d]) => `<tr><td><b>${r}</b></td><td>${d}</td></tr>`).join("")}</table>
<h1 style="margin-top:24px">Contents</h1><ul class="toc">${toc}</ul></section>
${body}${issuesHtml}</body></html>`

const htmlPath = path.join(RUN, "guide.html")
fs.writeFileSync(htmlPath, html)
fs.mkdirSync(path.dirname(out), { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" })
await page.pdf({ path: out, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="font-size:8pt;color:#64748b;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' })
await browser.close()
console.log(`guide: ${flows.size} flows, ${steps.length} steps -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`)
