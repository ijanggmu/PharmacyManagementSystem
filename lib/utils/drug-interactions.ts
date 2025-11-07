/**
 * Drug Interaction Checking
 * Checks for potential drug interactions
 */

// Simplified drug interaction database
// In production, integrate with a professional drug interaction API
const DRUG_INTERACTIONS: Record<string, string[]> = {
  warfarin: ["aspirin", "ibuprofen", "naproxen"],
  aspirin: ["warfarin", "ibuprofen"],
  // Add more interactions as needed
}

export interface DrugInteraction {
  severity: "mild" | "moderate" | "severe"
  description: string
  drugs: string[]
}

export function checkDrugInteractions(medicines: string[]): DrugInteraction[] {
  const interactions: DrugInteraction[] = []

  for (let i = 0; i < medicines.length; i++) {
    for (let j = i + 1; j < medicines.length; j++) {
      const med1 = medicines[i].toLowerCase()
      const med2 = medicines[j].toLowerCase()

      if (DRUG_INTERACTIONS[med1]?.includes(med2)) {
        interactions.push({
          severity: "moderate",
          description: `Potential interaction between ${medicines[i]} and ${medicines[j]}`,
          drugs: [medicines[i], medicines[j]],
        })
      }
    }
  }

  return interactions
}

export async function checkAllergies(
  customerId: string,
  medicines: string[]
): Promise<{ hasAllergy: boolean; allergies: string[] }> {
  // In production, fetch from customer allergies table
  // This is a placeholder
  const supabase = await import("@/lib/supabase/client").then((m) => m.createClient())
  
  const { data: customer } = await supabase
    .from("customers")
    .select("allergies")
    .eq("id", customerId)
    .single()

  const customerAllergies = (customer?.allergies as string[]) || []
  const matchedAllergies = medicines.filter((med) =>
    customerAllergies.some((allergy) =>
      med.toLowerCase().includes(allergy.toLowerCase())
    )
  )

  return {
    hasAllergy: matchedAllergies.length > 0,
    allergies: matchedAllergies,
  }
}

