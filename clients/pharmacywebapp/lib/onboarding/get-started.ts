/**
 * Rules for the "Create your pharmacy" (Get started) flow, kept free of React so they can be unit tested.
 * They mirror the .NET SignUpTenantCommandValidator and Identity's password policy exactly, so the form
 * never accepts something the server will reject.
 */
import { z } from "zod"

/** Identity's password policy (IdentityModuleConstants.PasswordLength + digit/upper/lower). */
export const PASSWORD_MIN_LENGTH = 10

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

export const RESERVED_SLUGS = new Set([
  "root", "admin", "administrator", "superadmin", "api", "www", "app", "system", "static",
  "public", "assets", "login", "signup", "support", "help", "null", "undefined",
])

export const STEPS = [
  { id: "account", title: "Your account", description: "How you'll sign in" },
  { id: "pharmacy", title: "Your pharmacy", description: "Name and sign-in code" },
  { id: "review", title: "Review", description: "Check and create" },
] as const

export type StepId = (typeof STEPS)[number]["id"]

export interface GetStartedData {
  adminFirstName: string
  adminLastName: string
  adminEmail: string
  adminPassword: string
  adminConfirmPassword: string
  pharmacyName: string
  slug: string
  phoneNumber: string
}

export type FieldName = keyof GetStartedData
export type FieldErrors = Partial<Record<FieldName, string>>

export const INITIAL_DATA: GetStartedData = {
  adminFirstName: "",
  adminLastName: "",
  adminEmail: "",
  adminPassword: "",
  adminConfirmPassword: "",
  pharmacyName: "",
  slug: "",
  phoneNumber: "",
}

/** Which fields each step owns (for validation and focusing the first error). */
export const STEP_FIELDS: Record<Exclude<StepId, "review">, FieldName[]> = {
  account: ["adminFirstName", "adminLastName", "adminEmail", "adminPassword", "adminConfirmPassword"],
  pharmacy: ["pharmacyName", "slug", "phoneNumber"],
}

/** Non-sensitive fields that may be saved as a draft. Never passwords or Google tokens. */
export const DRAFT_FIELDS = ["pharmacyName", "slug", "adminFirstName", "adminLastName", "adminEmail", "phoneNumber"] as const

export interface PasswordCheck {
  id: "length" | "upper" | "lower" | "digit"
  label: string
  met: boolean
}

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
    { id: "upper", label: "An uppercase letter", met: /[A-Z]/.test(password) },
    { id: "lower", label: "A lowercase letter", met: /[a-z]/.test(password) },
    { id: "digit", label: "A number", met: /[0-9]/.test(password) },
  ]
}

/** 0–4: how many policy rules are met, plus a bonus for length ≥ 14 with a symbol (capped at 4). */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: "" }
  const met = passwordChecks(password).filter((c) => c.met).length
  const allMet = met === 4
  const strong = allMet && password.length >= 14 && /[^A-Za-z0-9]/.test(password)
  const score = (strong ? 4 : allMet ? 3 : Math.min(met, 2)) as 0 | 1 | 2 | 3 | 4
  const label = score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong"
  return { score, label }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

const name = (label: string) => z.string().trim().min(1, `Enter your ${label}.`).max(100, "Use 100 characters or fewer.")

function accountSchema(withGoogle: boolean) {
  const base = z.object({
    adminFirstName: name("first name"),
    adminLastName: name("last name"),
    adminEmail: z.string().trim().email("Enter a valid email, e.g. owner@yourpharmacy.com."),
  })
  if (withGoogle) return base
  return base
    .extend({
      adminPassword: z
        .string()
        .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
        .regex(/[A-Z]/, "Add an uppercase letter.")
        .regex(/[a-z]/, "Add a lowercase letter.")
        .regex(/[0-9]/, "Add a number."),
      adminConfirmPassword: z.string().min(1, "Re-enter your password."),
    })
    .refine((d) => d.adminPassword === d.adminConfirmPassword, {
      message: "Passwords do not match.",
      path: ["adminConfirmPassword"],
    })
}

const pharmacySchema = z.object({
  pharmacyName: z.string().trim().min(2, "Enter your pharmacy's name (at least 2 characters).").max(200),
  slug: z
    .string()
    .trim()
    .min(2, "Must be at least 2 characters.")
    .max(40, "Must be 40 characters or fewer.")
    .refine((v) => SLUG_PATTERN.test(v), {
      message: "Use lowercase letters, numbers and single hyphens (e.g. sunrise-pharmacy).",
    })
    .refine((v) => !RESERVED_SLUGS.has(v), { message: "That code is reserved — please pick another." }),
  phoneNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\+?[0-9\s-]{7,16}$/.test(v), {
      message: "Enter a phone number with 7–15 digits, e.g. +977 98XXXXXXXX.",
    }),
})

/** Errors for one step (account | pharmacy), keyed by field; empty when the step is valid. */
export function validateStep(step: Exclude<StepId, "review">, data: GetStartedData, withGoogle: boolean): FieldErrors {
  const schema = step === "account" ? accountSchema(withGoogle) : pharmacySchema
  const parsed = schema.safeParse(data)
  if (parsed.success) return {}
  const errors: FieldErrors = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as FieldName | undefined
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}

/** All errors across steps, and the first step that has one (null when everything is valid). */
export function validateAll(data: GetStartedData, withGoogle: boolean): { errors: FieldErrors; firstInvalidStep: StepId | null } {
  const account = validateStep("account", data, withGoogle)
  const pharmacy = validateStep("pharmacy", data, withGoogle)
  const errors = { ...account, ...pharmacy }
  const firstInvalidStep = Object.keys(account).length ? "account" : Object.keys(pharmacy).length ? "pharmacy" : null
  return { errors, firstInvalidStep }
}

/** Friendly names for the backend provisioning steps. */
export const PROVISIONING_STEP_LABELS: Record<string, string> = {
  Database: "Preparing your workspace",
  Migrations: "Setting up records",
  Seeding: "Creating your admin account and Main Branch",
  CacheWarm: "Finishing touches",
}

export function provisioningStepLabel(step: string): string {
  return PROVISIONING_STEP_LABELS[step] ?? step.replace(/([a-z])([A-Z])/g, "$1 $2")
}

export type ProvisioningPhase = "pending" | "running" | "completed" | "failed"

export function provisioningPhase(status: string | null | undefined): ProvisioningPhase {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "running":
      return "running"
    default:
      return "pending"
  }
}
