# Live QA run + owner guide (PDF + video) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the live site (https://pharmacare.codehop.codes) the way a real pharmacy does, as every role, find what is broken or missing, fix what is broken, and hand the owner a full guide as a PDF and a captioned video.

**Architecture:** The existing guided Playwright suite (`clients/pharmacywebapp/e2e-live`, flows 00–30) is the engine: it signs up a fresh pharmacy, creates staff for each role, and drives every workflow with captions, recording one video per flow plus findings. `helpers/guide.ts` now also logs every step (caption + screenshot) to `.run/steps.jsonl`, which a small script turns into the PDF. A read-only gap review runs in parallel. Fixes go on branch `qa/live-full-run-20261124` and into one PR, which is not merged (merging `main` deploys the live site).

**Tech Stack:** Playwright 1.60 (Chromium), Next.js web app, .NET API, ffmpeg, Node 24.

**Spec:** the user's request (2026-11-24): "run it and check all the functions needed in the pharmacy… what are the gaps… different agents… run it on the browser… full guide PDF and video… feedback and fixes… use it as a pharmacy owner and all the different roles". Target chosen: live site, keep the test pharmacy.

## Global Constraints

- Target `LIVE_BASE_URL=https://pharmacare.codehop.codes`; test pharmacy `qa-flow-pharmacy-<MMDD-HHmm>` is **kept** afterwards.
- Passwords come from `e2e-live/.run/credentials.env` (gitignored) — never the repo defaults. Flow 30 uses `ROOT_EMAIL=admin@root.com`, `ROOT_PASSWORD` from `/opt/pharmacy/.env` (`SEED_ADMIN_PASSWORD`), never committed.
- Flows share one pharmacy: run in order from 00; a broken run restarts from 00, never mid-way.
- Run each chunk with `run_in_background` and wait for the notification; never overlap two chunks.
- Do not merge the PR. Do not touch `src/BuildingBlocks`. Feature freeze: missing features are reported as recommendations, not built, unless the user approves.
- Guide wording: plain words for a small, non-technical pharmacy owner; no accounting jargon without a one-line explanation.
- Outputs land in `C:\Users\sthae\Downloads\pharmacare-guide-20261124\` (PDF, MP4s, findings report).

## Review Focus

- A flow fails half-way and later flows fail only because state is missing → triage must separate "real bug" from "knock-on"; Task 4 tags each finding `root` or `knock-on`.
- Live site slowness (cold API, nginx 502) mistaken for a bug → Task 4 re-checks each finding by hand in the browser before it is called a bug.
- Step screenshots taken while a page is still loading (spinner instead of screen) → Task 5 drops a step image that is near-blank and uses the next frame from the video at `videoTime + 2s` instead.
- Nepali text (देवनागरी) in the PDF renders as boxes → Task 5's PDF is printed by Chromium with a Devanagari font stack; check one Nepali page in the output.
- Huge PDF (≈600 full-size PNGs) → Task 5 converts screenshots to 1200px JPEG q80 before embedding; target < 60 MB.

---

### Task 1: Step capture in the guide helper (done before the plan, verify only)

**Files:**
- Modify: `clients/pharmacywebapp/e2e-live/helpers/guide.ts` (`recordStep`, called from `step()`)

**Interfaces:**
- Produces: `.run/steps.jsonl` lines `{flow, step, title, detail, videoTime, url, screenshot}`; images at `.run/steps/<flow-slug>/NN.png`.

- [ ] **Step 1:** `cd clients/pharmacywebapp; npx tsc --noEmit -p tsconfig.json` and `npx eslint e2e-live/helpers/guide.ts` → no errors.
- [ ] **Step 2:** Commit `e2e-live: log every guided step with a screenshot for the written guide`.

### Task 2: Gap review (parallel, read-only agent)

- [ ] **Step 1:** A general-purpose agent maps seeded roles → permissions → screens and checks a Nepal small-pharmacy checklist (VAT 13% / IRD, DDA narcotics register, BS dates, batches/expiry, loose units, credit, cash drawer, reports, accounting, payroll, printing, backups, SMS, offline). Output: PRESENT / PARTIAL / MISSING per item with file citations, top-10 gaps with size S/M/L, wrong role permissions. (Already running.)

### Task 3: Fresh full run on the live site

Chunks (each: `set -a; . e2e-live/.run/credentials.env; set +a; LIVE_BASE_URL=https://pharmacare.codehop.codes yarn test:live "<pattern>" > e2e-live/.run/chunk-<x>.log 2>&1`):

| Chunk | Pattern | Covers |
|---|---|---|
| a | `flows/0[0-5]-` | sign-up, settings, branches, staff & roles, suppliers, customers |
| b | `flows/(0[6-9]\|10)-` | medicines, go-live setup, drawer, counter sales, prescriptions/narcotics |
| c | `flows/1[1-6]-` | returns, refunds, customer payments, close drawer, reorder→PO→receive, direct receipt |
| d | `flows/(1[7-9]\|2[0-2])-` | supplier payments/returns/claims, consignment, stock count, transfer, expiry |
| e | `flows/2[3-9]-` | expenses, payroll, accounting, VAT/IRD, reports, role restrictions, profile/tickets |
| f | `flows/30-` (+ ROOT_* env) | platform super-admin |

- [ ] **Step 1..6:** Run each chunk; after each, read the log's pass/fail lines and `findings.json` count. Expected: every test `✓`; findings recorded, not thrown.
- [ ] **Step 7:** A test that *crashes* (✘) rather than logs a finding → read its error, decide: product bug (log it) or test drift (fix the spec, commit), then rerun from 00 only if later flows depend on it.

### Task 4: Hands-on role check + triage

- [ ] **Step 1:** In Chrome (claude-in-chrome), sign in as owner, manager, pharmacist, cashier, accountant from `.run/state.json` and the root admin; on each, open the sidebar and every page it lists; note anything that errors, is blank, is in English-only when Nepali is chosen, or that the role should not see (cashier → profit/accounting).
- [ ] **Step 2:** Merge `findings.json` + hands-on notes + gap review into `findings-report.md`: ID, severity (blocker/major/minor/cosmetic), role, flow/step, video time, expected vs actual, `root`/`knock-on`, `bug`/`gap`.
- [ ] **Step 3:** Re-check each `bug` once by hand; drop flakes.

### Task 5: Fixes (one task per confirmed bug, TDD)

For each confirmed blocker/major bug: failing test (Vitest in `clients/pharmacywebapp`, or xUnit in `src/Tests/<Module>.Tests`) → fix → test passes → commit `fix(<area>): <what the owner sees>`. Minor/cosmetic: fix if < ~30 lines. Gaps: not built; listed with size for the user to choose.

- [ ] **Step N:** `yarn test` (web) and `dotnet test src/FSH.Starter.slnx --filter "FullyQualifiedName!~Integration"` pass; push branch; open PR to `main` with the findings table; do not merge.

### Task 6: PDF guide

**Files:**
- Create: `clients/pharmacywebapp/e2e-live/tools/build-guide.ts` — reads `.run/steps.jsonl` + `.run/state.json`, groups flows by role chapter (Owner setup 00–03, 07, 25–27; Counter/Cashier 08–14; Pharmacist 06, 10, 22; Store/Purchasing 15–21; Accountant 17, 23–26; Staff & permissions 03, 28; Help 29; Platform admin 30), writes `guide.html` and prints it to PDF with Playwright `page.pdf({ format: "A4" })`.

- [ ] **Step 1:** Run `npx tsx e2e-live/tools/build-guide.ts --out "C:\Users\sthae\Downloads\pharmacare-guide-20261124\PharmaCare-Guide.pdf"` → PDF with cover, contents, "who does what" role table, one numbered section per flow (step title, explanation, screenshot), and a "Known issues" appendix from the report.
- [ ] **Step 2:** Open 3 pages (cover, a counter-sale page, a Nepali page) and check images and text render; size < 60 MB.

### Task 7: Video

- [ ] **Step 1:** Per flow: `ffmpeg -i videos/<f>.webm -c:v libx264 -crf 26 -pix_fmt yuv420p <out>/<f>.mp4`.
- [ ] **Step 2:** Full guide: 3-second title card per flow (ffmpeg `drawtext` on black, flow name) + concat → `PharmaCare-Full-Guide.mp4` with chapter metadata (one chapter per flow).
- [ ] **Step 3:** `ffprobe` duration ≈ sum of parts; play the first chapter.

### Task 8: Hand-off

- [ ] **Step 1:** Publish the findings report (gaps + bugs + fixed/not fixed) as an artifact; give the user the Downloads folder, PDF, video, PR link, the test pharmacy's logins location (`e2e-live/.run/state.json`), and the half-built pharmacy `qa-flow-pharmacy-1124-2033` left by the stopped run (ask before deleting).
