using System.Text;
using FSH.Modules.Sales.Contracts.Safety;

namespace FSH.Modules.Sales.Services;

/// <summary>One cart medicine as the allergy check sees it: the label shown in the warning plus every name it
/// is known by (brand/product name and generic name), each of which is matched.</summary>
public sealed record AllergyCheckMedicine(string Label, string? Name = null, string? GenericName = null);

/// <summary>
/// Pure matching logic for the cart-level safety checks, ported from legacy
/// <c>lib/utils/drug-interactions.ts</c> (<c>checkDrugInteractions</c> / the matching half of
/// <c>checkAllergies</c>). No I/O — callers resolve medicine labels and the customer's allergy list
/// first. Interactions match <see cref="DrugInteractionReference"/> entries case-insensitively, by substring,
/// exactly as the legacy TypeScript did.
/// <para>Allergies are matched more carefully than the legacy substring test: against the medicine's name AND
/// its generic name, ignoring case, spaces and punctuation ("Co-Amoxiclav" = "coamoxiclav"), and through a
/// small drug-class / synonym table (<see cref="AllergyClasses"/>) — a customer recorded as "penicillin
/// allergic" is warned about amoxicillin, Augmentin or cloxacillin, one recorded as "sulfa" about
/// co-trimoxazole, one recorded as "NSAIDs" about ibuprofen or diclofenac. A class name used as the allergy
/// ("sulfa", "NSAID") matches through the class's members only, so "sulfa" does not flag ferrous sulfate.
/// It is a counter-side safety prompt the pharmacist can acknowledge, not a clinical cross-reactivity
/// database.</para>
/// </summary>
public static class SaleSafetyChecker
{
    /// <summary>Normalized allergy terms shorter than this are ignored (a stray "a" would match everything).</summary>
    private const int MinTermLength = 3;

    /// <summary>A drug class or synonym group. <c>Aliases</c> name the class (they identify it in an allergy
    /// entry but are not searched for in medicine names); <c>Members</c> are searched for.</summary>
    internal sealed record AllergyClass(string Name, IReadOnlyList<string> Aliases, IReadOnlyList<string> Members);

    /// <summary>Common allergy classes / synonyms for medicines sold in Nepal (generic names plus a few
    /// widely-sold brand names). Lower-case; matching normalizes away spaces and punctuation.</summary>
    internal static readonly IReadOnlyList<AllergyClass> AllergyClasses =
    [
        new("Penicillins",
            ["penicillins", "penicillin allergy", "betalactam"],
            ["penicillin", "cillin", "amoxicillin", "amoxycillin", "ampicillin", "cloxacillin", "dicloxacillin",
             "flucloxacillin", "piperacillin", "benzathine", "augmentin", "co-amoxiclav", "amoxiclav", "moxclav",
             "clavam", "novamox", "penidure"]),
        new("Cephalosporins",
            ["cephalosporin", "cephalosporins"],
            ["cephalexin", "cefalexin", "cefadroxil", "cephradine", "cefuroxime", "cefixime", "cefpodoxime",
             "cefdinir", "ceftriaxone", "cefotaxime", "ceftazidime", "cefoperazone", "cefepime", "cefazolin",
             "cefprozil"]),
        new("Sulfonamides",
            ["sulfa", "sulpha", "sulfa drugs", "sulpha drugs", "sulfonamide", "sulfonamides", "sulphonamide",
             "sulphonamides"],
            ["sulfamethoxazole", "sulphamethoxazole", "co-trimoxazole", "cotrimoxazole", "sulfadiazine",
             "sulphadiazine", "sulfasalazine", "sulphasalazine", "sulfacetamide", "sulphacetamide", "bactrim",
             "septran", "septra"]),
        new("NSAIDs",
            ["nsaid", "nsaids", "anti-inflammatory", "antiinflammatory", "painkiller nsaid"],
            ["ibuprofen", "diclofenac", "aceclofenac", "aspirin", "acetylsalicylic", "naproxen", "ketorolac",
             "mefenamic", "indomethacin", "piroxicam", "meloxicam", "etoricoxib", "celecoxib", "nimesulide",
             "flurbiprofen", "ketoprofen", "brufen", "combiflam", "flexon", "voveran", "disprin", "ecosprin"]),
        new("Paracetamol",
            ["acetaminophen"],
            ["paracetamol", "acetaminophen", "cetamol", "calpol", "crocin"]),
        new("Macrolides",
            ["macrolide", "macrolides"],
            ["erythromycin", "azithromycin", "clarithromycin", "roxithromycin", "azithral", "zithromax"]),
        new("Fluoroquinolones",
            ["quinolone", "quinolones", "fluoroquinolone", "fluoroquinolones"],
            ["floxacin", "ciprofloxacin", "levofloxacin", "ofloxacin", "norfloxacin", "moxifloxacin"]),
        new("Tetracyclines",
            ["tetracyclines"],
            ["tetracycline", "doxycycline", "minocycline"]),
        new("Nitroimidazoles",
            ["nitroimidazole", "nitroimidazoles"],
            ["metronidazole", "tinidazole", "ornidazole", "secnidazole", "flagyl"]),
        new("Opioids",
            ["opioid", "opioids", "opiate", "opiates"],
            ["codeine", "morphine", "tramadol", "tapentadol", "pethidine", "fentanyl", "oxycodone"]),
    ];

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

    /// <summary>Allergy check against labels only (each label is the only name matched).</summary>
    public static AllergyWarning? FindAllergyMatch(IReadOnlyList<string> medicineLabels, IReadOnlyList<string> customerAllergies)
    {
        ArgumentNullException.ThrowIfNull(medicineLabels);
        return FindAllergyMatch(medicineLabels.Select(l => new AllergyCheckMedicine(l)).ToList(), customerAllergies);
    }

    /// <summary>
    /// The cart medicines that match any of the customer's allergies — by name or generic name, directly or
    /// through the drug-class / synonym table. Null when nothing matches.
    /// </summary>
    public static AllergyWarning? FindAllergyMatch(IReadOnlyList<AllergyCheckMedicine> medicines, IReadOnlyList<string> customerAllergies)
    {
        ArgumentNullException.ThrowIfNull(medicines);
        ArgumentNullException.ThrowIfNull(customerAllergies);

        if (customerAllergies.Count == 0)
        {
            return null;
        }

        var terms = customerAllergies.SelectMany(TermsFor).Distinct(StringComparer.Ordinal).ToList();
        if (terms.Count == 0)
        {
            return null;
        }

        var matched = medicines
            .Where(m => NamesOf(m).Any(name => terms.Exists(term => name.Contains(term, StringComparison.Ordinal))))
            .Select(m => m.Label)
            .ToList();

        return matched.Count == 0 ? null : new AllergyWarning(matched, customerAllergies);
    }

    /// <summary>The normalized terms one allergy entry is searched for: the entry itself plus, when it names
    /// or mentions a drug class / synonym group, every member of that group. A bare class alias ("sulfa")
    /// is searched for through the members only.</summary>
    internal static IEnumerable<string> TermsFor(string allergy)
    {
        ArgumentNullException.ThrowIfNull(allergy);

        string entry = Normalize(allergy);
        if (entry.Length < MinTermLength)
        {
            return [];
        }

        var words = Words(allergy);
        var terms = new List<string>();
        bool bareAlias = false;
        foreach (var group in AllergyClasses)
        {
            bool aliasHit = group.Aliases.Any(a => NamesClass(entry, words, a));
            bool memberHit = group.Members.Any(m => MentionsMember(entry, Normalize(m)));
            if (!aliasHit && !memberHit)
            {
                continue;
            }

            bareAlias |= group.Aliases.Any(a => Normalize(a) == entry) && !memberHit;
            terms.AddRange(group.Members.Select(Normalize));
        }

        if (!bareAlias)
        {
            terms.Add(entry);
        }

        return terms.Where(t => t.Length >= MinTermLength);
    }

    /// <summary>The allergy entry names the class: it is the alias, or the alias is one of its words
    /// ("sulfa drugs", "NSAIDs intolerance") — never a fragment of a word, so "magnesium sulfate" is not
    /// "sulfa".</summary>
    private static bool NamesClass(string entry, IReadOnlyList<string> words, string alias)
    {
        string normalized = Normalize(alias);
        return normalized.Length >= MinTermLength
            && (entry == normalized
                || words.Contains(normalized)
                || (alias.Contains(' ', StringComparison.Ordinal) && entry.Contains(normalized, StringComparison.Ordinal)));
    }

    /// <summary>The allergy entry is the member or mentions it ("amoxicillin 500", "penicillin allergy").
    /// Members shorter than 5 characters must match exactly.</summary>
    private static bool MentionsMember(string entry, string member) =>
        member.Length >= MinTermLength
        && (entry == member || (member.Length >= 5 && entry.Contains(member, StringComparison.Ordinal)));

    private static List<string> Words(string value)
    {
        var words = new List<string>();
        var current = new StringBuilder();
        foreach (char c in value)
        {
            if (char.IsLetterOrDigit(c))
            {
                current.Append(char.ToLowerInvariant(c));
            }
            else if (current.Length > 0)
            {
                words.Add(current.ToString());
                current.Clear();
            }
        }

        if (current.Length > 0)
        {
            words.Add(current.ToString());
        }

        return words;
    }

    private static IEnumerable<string> NamesOf(AllergyCheckMedicine medicine) =>
        new[] { medicine.Label, medicine.Name, medicine.GenericName }
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => Normalize(n!))
            .Where(n => n.Length > 0);

    /// <summary>Lower-case letters and digits only: "Co-Amoxiclav 625 mg" → "coamoxiclav625mg".</summary>
    internal static string Normalize(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (char c in value)
        {
            if (char.IsLetterOrDigit(c))
            {
                builder.Append(char.ToLowerInvariant(c));
            }
        }

        return builder.ToString();
    }
}
