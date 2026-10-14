using System.Text;

namespace FSH.Modules.Sales.Contracts.Safety;

/// <summary>
/// Ported from the legacy <c>lib/utils/drug-interactions.ts</c> DRUG_INTERACTIONS table. A small
/// illustrative reference set, not a clinical-grade drug-interaction database — a real deployment
/// should integrate a licensed drug-interaction API — but it is the same table the legacy checkout
/// used, kept as a static lookup so Sales can run the identical check without a DB round trip.
/// <para>Matching works on the ingredients a product label names (<see cref="IngredientsOf"/>), not on the exact
/// label: "Warfarin Sodium 5mg", "Ibuprofen 400mg", "Paracetamol + Ibuprofen" or "Acetylsalicylic Acid" all
/// resolve to the ingredients the table is keyed by. Strengths, units, dosage forms and salt words are dropped,
/// combinations are split on <c>+ / &amp; ,</c> and "and"/"with", and a few synonyms map to the table's names.</para>
/// </summary>
public static class DrugInteractionReference
{
    public sealed record Entry(string With, string Severity, string Note);

    private static readonly Dictionary<string, IReadOnlyList<Entry>> Table =
        new Dictionary<string, IReadOnlyList<Entry>>(StringComparer.OrdinalIgnoreCase)
        {
            ["warfarin"] = new[]
            {
                new Entry("aspirin", "severe", "Increased bleeding risk"),
                new Entry("ibuprofen", "severe", "Increased bleeding risk"),
                new Entry("naproxen", "severe", "Increased bleeding risk"),
            },
            ["aspirin"] = new[]
            {
                new Entry("warfarin", "severe", "Increased bleeding risk"),
                new Entry("ibuprofen", "moderate", "Reduced cardioprotective effect of aspirin"),
            },
            ["metformin"] = new[]
            {
                new Entry("contrast", "severe", "Risk of lactic acidosis"),
            },
            ["simvastatin"] = new[]
            {
                new Entry("clarithromycin", "severe", "Increased risk of myopathy/rhabdomyolysis"),
            },
            ["sildenafil"] = new[]
            {
                new Entry("nitroglycerin", "severe", "Severe, potentially fatal hypotension"),
            },
            ["maoinhibitor"] = new[]
            {
                new Entry("sertraline", "severe", "Risk of serotonin syndrome"),
            },
        };

    /// <summary>Other names of the table's ingredients (multi-word ones are matched on the whole phrase).</summary>
    private static readonly Dictionary<string, string> Synonyms = new(StringComparer.Ordinal)
    {
        ["acetylsalicylic acid"] = "aspirin",
        ["acetylsalicylic"] = "aspirin",
        ["glyceryl trinitrate"] = "nitroglycerin",
        ["gtn"] = "nitroglycerin",
        ["nitroglycerine"] = "nitroglycerin",
        ["phenelzine"] = "maoinhibitor",
        ["tranylcypromine"] = "maoinhibitor",
        ["isocarboxazid"] = "maoinhibitor",
        ["selegiline"] = "maoinhibitor",
        ["rasagiline"] = "maoinhibitor",
        ["moclobemide"] = "maoinhibitor",
        ["mao inhibitor"] = "maoinhibitor",
        ["iohexol"] = "contrast",
        ["iopamidol"] = "contrast",
        ["iodixanol"] = "contrast",
        ["iopromide"] = "contrast",
    };

    /// <summary>Words that describe a product rather than an ingredient: salts, units, dosage forms, release types.</summary>
    private static readonly HashSet<string> NonIngredientWords = new(StringComparer.Ordinal)
    {
        "sodium", "potassium", "calcium", "magnesium", "hydrochloride", "hcl", "hydrobromide", "sulfate", "sulphate",
        "citrate", "maleate", "mesylate", "besylate", "tartrate", "succinate", "fumarate", "phosphate", "acetate",
        "dihydrate", "monohydrate", "trihydrate", "anhydrous", "base", "salt",
        "mg", "mcg", "g", "gm", "kg", "ml", "l", "iu", "unit", "units", "percent", "w", "v",
        "tab", "tabs", "tablet", "tablets", "cap", "caps", "capsule", "capsules", "syrup", "suspension", "susp",
        "injection", "inj", "drops", "drop", "cream", "ointment", "gel", "spray", "solution", "sol", "powder",
        "sachet", "lotion", "patch", "inhaler", "vial", "ampoule", "strip", "bottle", "oral", "topical",
        "sr", "er", "xr", "cr", "mr", "dr", "ds", "forte", "plus", "retard", "dispersible", "chewable", "film",
        "coated", "enteric", "extended", "sustained", "modified", "delayed", "release",
    };

    private static readonly string[] CombinationWords = ["and", "with"];

    /// <param name="medicineName">Medicine label; any of the ingredients it names that the table is keyed by.</param>
    public static IReadOnlyList<Entry> EntriesFor(string medicineName)
    {
        ArgumentNullException.ThrowIfNull(medicineName);
        return IngredientsOf(medicineName)
            .Where(Table.ContainsKey)
            .SelectMany(i => Table[i])
            .ToList();
    }

    /// <summary>The first table entry that makes <paramref name="first"/> and <paramref name="second"/> interact, in either
    /// direction; null when they don't. Each label is matched on its ingredients (<see cref="IngredientsOf"/>).</summary>
    public static Entry? FindInteraction(string first, string second)
    {
        ArgumentNullException.ThrowIfNull(first);
        ArgumentNullException.ThrowIfNull(second);

        var a = IngredientsOf(first);
        var b = IngredientsOf(second);
        return Match(a, b) ?? Match(b, a);
    }

    private static Entry? Match(IReadOnlySet<string> from, IReadOnlySet<string> to) =>
        from.Where(Table.ContainsKey)
            .SelectMany(i => Table[i])
            .FirstOrDefault(e => to.Contains(e.With));

    /// <summary>
    /// The ingredients a product label names, lower-case: "Warfarin Sodium 5 mg Tablet" → {warfarin};
    /// "Paracetamol 500mg + Ibuprofen 400mg" → {paracetamol, ibuprofen}; "Acetylsalicylic Acid" → {aspirin, ...}.
    /// Each part of a combination contributes its remaining words, the words joined, and any synonym.
    /// </summary>
    public static IReadOnlySet<string> IngredientsOf(string label)
    {
        ArgumentNullException.ThrowIfNull(label);

        var ingredients = new HashSet<string>(StringComparer.Ordinal);
        foreach (var part in SplitCombination(label))
        {
            var words = Words(part).Where(w => w.Length > 1 && !NonIngredientWords.Contains(w)).ToList();
            if (words.Count == 0)
            {
                continue;
            }

            string phrase = string.Join(' ', words);
            AddWithSynonym(ingredients, phrase);
            ingredients.Add(phrase.Replace(" ", string.Empty, StringComparison.Ordinal));
            foreach (var word in words)
            {
                AddWithSynonym(ingredients, word);
            }
        }

        return ingredients;
    }

    private static void AddWithSynonym(HashSet<string> ingredients, string term)
    {
        ingredients.Add(term);
        if (Synonyms.TryGetValue(term, out string? canonical))
        {
            ingredients.Add(canonical);
        }
    }

    /// <summary>Splits a combination product on <c>+ / &amp; , ;</c> and the words "and" / "with".</summary>
    private static List<string> SplitCombination(string label)
    {
        var parts = new List<string>();
        foreach (var piece in label.Split(['+', '/', '&', ',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var current = new List<string>();
            foreach (var word in piece.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            {
                if (CombinationWords.Contains(word, StringComparer.OrdinalIgnoreCase))
                {
                    parts.Add(string.Join(' ', current));
                    current.Clear();
                    continue;
                }

                current.Add(word);
            }

            parts.Add(string.Join(' ', current));
        }

        return parts.Where(p => p.Length > 0).ToList();
    }

    /// <summary>Lower-case runs of letters: digits and punctuation separate words ("400mg" → "mg").</summary>
    private static List<string> Words(string value)
    {
        var words = new List<string>();
        var current = new StringBuilder();
        foreach (char c in value)
        {
            if (char.IsLetter(c))
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
}
