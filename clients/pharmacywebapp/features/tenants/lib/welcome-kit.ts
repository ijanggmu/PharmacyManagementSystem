/**
 * The PharmaCare welcome handed to a new tenant's first admin: the same details the API's welcome email
 * (TenantWelcomeEmail.cs) sends, here as a downloadable PDF and copyable text. Built in the browser right
 * after creation, because the password exists only in the operator's form and is never stored.
 */

import { containsDevanagari, loadDevanagariFont, registerDevanagariFont } from "@/features/accounting/lib/pdf-fonts"
import { pdfText } from "@/features/accounting/lib/report-export"

export interface WelcomeKitDetails {
  pharmacyName: string
  tenantCode: string
  signInUrl: string
  adminEmail: string
  adminPassword: string
  plan?: string | null
  /** ISO date-time; omitted when the status call failed. */
  validUpto?: string | null
}

export interface WelcomeKitRow {
  label: string
  value: string
  mono?: boolean
}

export const WELCOME_STEPS: readonly string[] = [
  "Sign in and change this temporary password from your profile.",
  "Turn on two-step verification for your account.",
  "Check your branch details, then add your staff and give each the right role.",
  "Add your medicines and opening stock, then start selling.",
]

export const WELCOME_PRIVACY_NOTE =
  "Keep this document private. It contains a password. PharmaCare staff will never ask you for it."

/** The tenant sign-in page: `/t/{code}/login` on the web app's origin. */
export function tenantSignInUrl(origin: string, tenantCode: string): string {
  return `${origin.replace(/\/+$/, "")}/t/${encodeURIComponent(tenantCode)}/login`
}

function formatValidUpto(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
}

/** A plan key ("free", "pro-annual") as a label ("Free", "Pro annual"); none means the trial. */
export function planLabel(plan: string | null | undefined): string {
  const key = plan?.trim()
  if (!key) return "Trial"
  const words = key.replace(/[-_]+/g, " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function welcomeKitRows(details: WelcomeKitDetails): WelcomeKitRow[] {
  const rows: WelcomeKitRow[] = [
    { label: "Pharmacy", value: details.pharmacyName },
    { label: "Pharmacy code", value: details.tenantCode, mono: true },
    { label: "Sign-in page", value: details.signInUrl },
    { label: "Admin email", value: details.adminEmail },
    { label: "Temporary password", value: details.adminPassword, mono: true },
    { label: "Plan", value: planLabel(details.plan) },
  ]
  const validUntil = formatValidUpto(details.validUpto)
  if (validUntil) rows.push({ label: "Valid until", value: validUntil })
  return rows
}

/** Plain-text version for "Copy details". */
export function welcomeKitText(details: WelcomeKitDetails): string {
  return [
    `Welcome to PharmaCare: ${details.pharmacyName} is ready`,
    "",
    ...welcomeKitRows(details).map((row) => `${row.label}: ${row.value}`),
    "",
    "Getting started:",
    ...WELCOME_STEPS.map((step, i) => `${i + 1}. ${step}`),
    "",
    WELCOME_PRIVACY_NOTE,
  ].join("\n")
}

export function welcomeKitFilename(tenantCode: string): string {
  return `pharmacare-welcome-${tenantCode.replace(/[^a-z0-9-]/gi, "") || "tenant"}.pdf`
}

/** Builds the one-page A4 welcome letter and saves it. */
export async function downloadWelcomePdf(details: WelcomeKitDetails): Promise<void> {
  const { default: JsPdf } = await import("jspdf")
  const pdf = new JsPdf({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 18
  const contentWidth = pageWidth - margin * 2

  // A Nepali pharmacy name needs the Devanagari font; without it (offline) those characters print as "?".
  const devanagari = containsDevanagari(details.pharmacyName) ? await loadDevanagariFont() : null
  const bodyFont = devanagari ? registerDevanagariFont(pdf, devanagari) : "helvetica"
  const text = (value: string) => pdfText(value, devanagari !== null)

  // Letterhead band.
  pdf.setFillColor(15, 118, 110)
  pdf.rect(0, 0, pageWidth, 30, "F")
  pdf.setTextColor(255, 255, 255)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(20)
  pdf.text("PharmaCare", margin, 15)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  pdf.text("Pharmacy management, done right", margin, 22)
  pdf.setFontSize(9)
  pdf.text("CONFIDENTIAL", pageWidth - margin, 15, { align: "right" })

  pdf.setTextColor(15, 23, 42)
  let y = 44
  pdf.setFont(bodyFont, "bold")
  pdf.setFontSize(15)
  const heading = pdf.splitTextToSize(text(`Welcome to PharmaCare, ${details.pharmacyName}`), contentWidth) as string[]
  pdf.text(heading, margin, y)
  y += heading.length * 7 + 2

  pdf.setFont(bodyFont, "normal")
  pdf.setFontSize(10.5)
  const intro = pdf.splitTextToSize(
    text(
      `Your pharmacy ${details.pharmacyName} has been set up on PharmaCare. You are its first administrator. ` +
        "Use the details below to sign in.",
    ),
    contentWidth,
  ) as string[]
  pdf.text(intro, margin, y)
  y += intro.length * 5.2 + 5

  // Details box.
  const rows = welcomeKitRows(details)
  const labelWidth = 46
  const rowHeights = rows.map((row) => {
    pdf.setFont(row.mono ? "courier" : bodyFont, "bold")
    const lines = pdf.splitTextToSize(text(row.value), contentWidth - labelWidth - 8) as string[]
    return Math.max(1, lines.length) * 5.5 + 3
  })
  const boxHeight = rowHeights.reduce((sum, h) => sum + h, 0) + 4
  pdf.setFillColor(248, 250, 252)
  pdf.setDrawColor(226, 232, 240)
  pdf.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, "FD")
  let rowY = y + 7
  rows.forEach((row, i) => {
    pdf.setFont(bodyFont, "normal")
    pdf.setFontSize(9.5)
    pdf.setTextColor(71, 85, 105)
    pdf.text(row.label, margin + 4, rowY)
    pdf.setTextColor(15, 23, 42)
    pdf.setFont(row.mono ? "courier" : bodyFont, "bold")
    pdf.setFontSize(row.mono ? 11 : 10)
    const lines = pdf.splitTextToSize(text(row.value), contentWidth - labelWidth - 8) as string[]
    pdf.text(lines, margin + labelWidth, rowY)
    rowY += rowHeights[i]
  })
  y += boxHeight + 10

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(11)
  pdf.text("Getting started", margin, y)
  y += 6
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  WELCOME_STEPS.forEach((step, i) => {
    const lines = pdf.splitTextToSize(`${i + 1}.  ${step}`, contentWidth - 4) as string[]
    pdf.text(lines, margin + 2, y)
    y += lines.length * 5.2 + 1.5
  })
  y += 5

  // Privacy note.
  pdf.setFillColor(254, 243, 199)
  const note = pdf.splitTextToSize(WELCOME_PRIVACY_NOTE, contentWidth - 8) as string[]
  const noteHeight = note.length * 5 + 6
  pdf.rect(margin, y, contentWidth, noteHeight, "F")
  pdf.setTextColor(120, 53, 15)
  pdf.text(note, margin + 4, y + 6)
  y += noteHeight + 10

  pdf.setTextColor(15, 23, 42)
  pdf.text("Welcome aboard,", margin, y)
  pdf.setFont("helvetica", "bold")
  pdf.text("The PharmaCare team", margin, y + 5.5)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(8)
  pdf.setTextColor(100, 116, 139)
  const pageHeight = pdf.internal.pageSize.getHeight()
  pdf.text(`Issued ${new Date().toISOString().slice(0, 10)}`, margin, pageHeight - 10)

  pdf.save(welcomeKitFilename(details.tenantCode))
}
