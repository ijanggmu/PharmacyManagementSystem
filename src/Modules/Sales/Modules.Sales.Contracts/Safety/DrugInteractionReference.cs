namespace FSH.Modules.Sales.Contracts.Safety;

/// <summary>
/// Ported from the legacy <c>lib/utils/drug-interactions.ts</c> DRUG_INTERACTIONS table. A small
/// illustrative reference set, not a clinical-grade drug-interaction database — a real deployment
/// should integrate a licensed drug-interaction API — but it is the same table the legacy checkout
/// used, kept as a static lookup so Sales can run the identical check without a DB round trip.
/// Keys and <see cref="Entry.With"/> values are lower-case; matching is substring-based, exactly as
/// the legacy TypeScript table matched (<c>b.includes(entry.with)</c>).
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

    /// <param name="medicineName">Medicine label; matched case-insensitively.</param>
    public static IReadOnlyList<Entry> EntriesFor(string medicineName) =>
        Table.TryGetValue(medicineName, out IReadOnlyList<Entry>? entries) ? entries : [];
}
