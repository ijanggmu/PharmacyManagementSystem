import { dotnetClient } from "@/lib/api/dotnet-client"

/** PharmacyLicenseDto (Reference module). `daysLeft` is negative once expired. */
export interface PharmacyLicense {
  id: string
  licenseType: string
  label: string
  title: string | null
  number: string
  holderName: string | null
  issuedOn: string | null
  expiresOn: string
  notes: string | null
  daysLeft: number
  status: "valid" | "expiring" | "expired"
}

export interface PharmacyLicenseInput {
  licenseType: string
  number: string
  expiresOn: string
  title?: string | null
  holderName?: string | null
  issuedOn?: string | null
  notes?: string | null
}

/** Mirrors PharmacyLicenseTypes on the server. */
export const LICENSE_TYPES: ReadonlyArray<{ value: string; label: string; hint: string }> = [
  { value: "dda_pharmacy", label: "DDA pharmacy license", hint: "Department of Drug Administration — renewed every 2 years" },
  { value: "pharmacist_registration", label: "Pharmacist registration (NPC)", hint: "Nepal Pharmacy Council registration of the pharmacist in charge" },
  { value: "pan_vat", label: "PAN / VAT registration", hint: "Inland Revenue Department" },
  { value: "municipality", label: "Municipality / ward registration", hint: "Local business registration, renewed yearly" },
  { value: "company", label: "Company registration (OCR)", hint: "Office of the Company Registrar" },
  { value: "other", label: "Other", hint: "Fire safety, signboard tax, …" },
]

/** Days before expiry when a license counts as "expiring" (matches the server). */
export const LICENSE_EXPIRING_WITHIN_DAYS = 60

const PATH = "/api/v1/reference/licenses"

export const licensesApi = {
  list: async (): Promise<PharmacyLicense[]> => dotnetClient.get<PharmacyLicense[]>(PATH),
  create: async (input: PharmacyLicenseInput): Promise<string> => dotnetClient.post<string>(PATH, input),
  update: async (id: string, input: PharmacyLicenseInput): Promise<void> => {
    await dotnetClient.put(`${PATH}/${encodeURIComponent(id)}`, { id, ...input })
  },
  remove: async (id: string): Promise<void> => {
    await dotnetClient.delete(`${PATH}/${encodeURIComponent(id)}`)
  },
}

/** "Expires in 12 days" / "Expires today" / "Expired 3 days ago". */
export function licenseDueText(daysLeft: number): string {
  if (daysLeft < 0) return `Expired ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`
  if (daysLeft === 0) return "Expires today"
  if (daysLeft === 1) return "Expires tomorrow"
  return `Expires in ${daysLeft} days`
}

/** Licenses that need attention (expiring within the window or expired), most urgent first. */
export function licensesNeedingAttention(licenses: readonly PharmacyLicense[]): PharmacyLicense[] {
  return licenses.filter((l) => l.daysLeft <= LICENSE_EXPIRING_WITHIN_DAYS).sort((a, b) => a.daysLeft - b.daysLeft)
}
