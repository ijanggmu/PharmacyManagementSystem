/**
 * Drug interaction / allergy checking — actually wired into the sale flow (see
 * app/api/sales/route.ts). Previously this module existed but was never called from
 * anywhere, and checkAllergies() queried a customers.allergies column that didn't
 * exist — calling it would have errored. Both are fixed here; the column now exists
 * (scripts/86-dispensing-safety-controls.sql) and checkAllergies takes a server-side
 * Supabase client instead of dynamically importing the browser client.
 *
 * The interaction database below is a small illustrative set, not a clinical-grade
 * reference (a real deployment should integrate a licensed drug-interaction API) —
 * but the check is a real, blocking-with-acknowledgment control now, not dead code.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

const DRUG_INTERACTIONS: Record<string, { with: string; severity: "mild" | "moderate" | "severe"; note: string }[]> = {
  warfarin: [
    { with: "aspirin", severity: "severe", note: "Increased bleeding risk" },
    { with: "ibuprofen", severity: "severe", note: "Increased bleeding risk" },
    { with: "naproxen", severity: "severe", note: "Increased bleeding risk" },
  ],
  aspirin: [
    { with: "warfarin", severity: "severe", note: "Increased bleeding risk" },
    { with: "ibuprofen", severity: "moderate", note: "Reduced cardioprotective effect of aspirin" },
  ],
  metformin: [{ with: "contrast", severity: "severe", note: "Risk of lactic acidosis" }],
  simvastatin: [{ with: "clarithromycin", severity: "severe", note: "Increased risk of myopathy/rhabdomyolysis" }],
  sildenafil: [{ with: "nitroglycerin", severity: "severe", note: "Severe, potentially fatal hypotension" }],
  maoinhibitor: [{ with: "sertraline", severity: "severe", note: "Risk of serotonin syndrome" }],
}

export interface DrugInteraction {
  severity: "mild" | "moderate" | "severe"
  description: string
  drugs: [string, string]
}

/** Pure, synchronous — safe to call client or server side. Names are matched
 *  case-insensitively against the small reference table above. */
export function checkDrugInteractions(medicineNames: string[]): DrugInteraction[] {
  const interactions: DrugInteraction[] = []

  for (let i = 0; i < medicineNames.length; i++) {
    for (let j = i + 1; j < medicineNames.length; j++) {
      const a = medicineNames[i].toLowerCase()
      const b = medicineNames[j].toLowerCase()

      const forward = DRUG_INTERACTIONS[a]?.find((entry) => b.includes(entry.with))
      const backward = DRUG_INTERACTIONS[b]?.find((entry) => a.includes(entry.with))
      const match = forward || backward

      if (match) {
        interactions.push({
          severity: match.severity,
          description: `${match.note} (${medicineNames[i]} + ${medicineNames[j]})`,
          drugs: [medicineNames[i], medicineNames[j]],
        })
      }
    }
  }

  return interactions
}

export interface AllergyMatch {
  hasAllergy: boolean
  matchedMedicines: string[]
  allergies: string[]
}

/** Server-side only — takes an already-authenticated Supabase client (RLS/tenant
 *  scoping is the caller's responsibility, same as every other server-service call). */
export async function checkAllergies(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  medicineNames: string[]
): Promise<AllergyMatch> {
  const { data: customer } = await supabase
    .from("customers")
    .select("allergies")
    .eq("id", customerId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  const customerAllergies = ((customer as { allergies?: string[] } | null)?.allergies || []).filter(Boolean)
  if (customerAllergies.length === 0) {
    return { hasAllergy: false, matchedMedicines: [], allergies: [] }
  }

  const matchedMedicines = medicineNames.filter((med) =>
    customerAllergies.some((allergy) => med.toLowerCase().includes(allergy.toLowerCase()))
  )

  return {
    hasAllergy: matchedMedicines.length > 0,
    matchedMedicines,
    allergies: customerAllergies,
  }
}
