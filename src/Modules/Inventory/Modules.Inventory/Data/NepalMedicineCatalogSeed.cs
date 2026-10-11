using System.Text.Json;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Data;

/// <summary>
/// Reference rows for the shared <see cref="NepalMedicineCatalogEntry"/> directory, embedded as
/// <c>Data/Seed/nepal-medicine-catalog.json</c>. Generated from a real pharmacy's purchase-history
/// export (brand names as stocked in Nepal); form and strength are parsed from the brand name.
/// Manufacturer and prices are intentionally absent — the source export's product column was not
/// row-aligned with its company/price columns, so those values could not be trusted.
/// </summary>
public static class NepalMedicineCatalogSeed
{
    public const string ResourceName = "FSH.Modules.Inventory.Data.Seed.nepal-medicine-catalog.json";

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public sealed record Row(string BrandName, string? Form = null, string? Strength = null, string? Dosage = null);

    public static IReadOnlyList<Row> Load()
    {
        using Stream stream = typeof(NepalMedicineCatalogSeed).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded resource '{ResourceName}' not found.");
        return JsonSerializer.Deserialize<List<Row>>(stream, JsonOptions) ?? [];
    }

    /// <summary>
    /// Inserts every seed row whose brand name (case-insensitive) is not already in the directory.
    /// Idempotent: safe to run on every tenant seed, including against a shared database.
    /// </summary>
    /// <returns>The number of rows inserted.</returns>
    public static async Task<int> SeedAsync(InventoryDbContext dbContext, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        List<string> existingNames = await dbContext.NepalMedicineCatalogEntries
            .AsNoTracking()
            .Select(e => e.BrandName)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var existing = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);

        var toAdd = Load()
            .Where(r => !string.IsNullOrWhiteSpace(r.BrandName) && existing.Add(r.BrandName.Trim()))
            .Select(r => NepalMedicineCatalogEntry.Create(r.BrandName, form: r.Form, strength: r.Strength, dosage: r.Dosage))
            .ToList();

        if (toAdd.Count == 0)
        {
            return 0;
        }

        dbContext.NepalMedicineCatalogEntries.AddRange(toAdd);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return toAdd.Count;
    }
}
