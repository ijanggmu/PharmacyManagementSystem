using FSH.Modules.Sales.Contracts.Safety;

namespace FSH.Modules.Sales.Services;

/// <summary>
/// Pure matching logic for the cart-level safety checks, ported from legacy
/// <c>lib/utils/drug-interactions.ts</c> (<c>checkDrugInteractions</c> / the matching half of
/// <c>checkAllergies</c>). No I/O — callers resolve medicine labels and the customer's allergy list
/// first (<see cref="DrugInteractionReference"/> entries and the cart/allergy lists are matched
/// case-insensitively, by substring, exactly as the legacy TypeScript did).
/// </summary>
internal static class SaleSafetyChecker
{
    public static IReadOnlyList<DrugInteractionWarning> FindInteractions(IReadOnlyList<string> medicineLabels)
    {
        ArgumentNullException.ThrowIfNull(medicineLabels);

        var interactions = new List<DrugInteractionWarning>();

        for (int i = 0; i < medicineLabels.Count; i++)
        {
            for (int j = i + 1; j < medicineLabels.Count; j++)
            {
                string a = medicineLabels[i];
                string b = medicineLabels[j];

                DrugInteractionReference.Entry? match =
                    DrugInteractionReference.EntriesFor(a).FirstOrDefault(e => b.Contains(e.With, StringComparison.OrdinalIgnoreCase))
                    ?? DrugInteractionReference.EntriesFor(b).FirstOrDefault(e => a.Contains(e.With, StringComparison.OrdinalIgnoreCase));

                if (match is not null)
                {
                    interactions.Add(new DrugInteractionWarning(
                        match.Severity,
                        $"{match.Note} ({medicineLabels[i]} + {medicineLabels[j]})",
                        medicineLabels[i],
                        medicineLabels[j]));
                }
            }
        }

        return interactions;
    }

    public static AllergyWarning? FindAllergyMatch(IReadOnlyList<string> medicineLabels, IReadOnlyList<string> customerAllergies)
    {
        ArgumentNullException.ThrowIfNull(medicineLabels);
        ArgumentNullException.ThrowIfNull(customerAllergies);

        if (customerAllergies.Count == 0)
        {
            return null;
        }

        var matched = medicineLabels
            .Where(med => customerAllergies.Any(allergy => med.Contains(allergy, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        return matched.Count == 0 ? null : new AllergyWarning(matched, customerAllergies);
    }
}
