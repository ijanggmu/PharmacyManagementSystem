using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// What makes a medicine "the same product" within a tenant: an exact name + strength + form match
/// (case-, surrounding-whitespace- and, for strength/form, inner-space-insensitive), and a barcode,
/// which identifies exactly one medicine. Soft-deleted medicines are excluded by the query filter.
/// </summary>
public static class MedicineIdentityGuard
{
    private const int MaxBarcodeAttempts = 10;

    public static async Task<List<DuplicateMedicineDto>> FindDuplicatesAsync(
        InventoryDbContext dbContext, string name, string? strength, string? form, Guid? excludeId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (string.IsNullOrWhiteSpace(name))
        {
            return [];
        }

        string nameKey = name.Trim().ToUpperInvariant();
        string strengthKey = CompactKey(strength);
        string formKey = CompactKey(form);

#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
        var query = dbContext.Medicines.AsNoTracking()
            .Where(m => m.Name.Trim().ToUpper() == nameKey
                && (m.Strength ?? string.Empty).Replace(" ", string.Empty).ToUpper() == strengthKey
                && (m.Form ?? string.Empty).Replace(" ", string.Empty).ToUpper() == formKey);
#pragma warning restore CA1304, CA1311, CA1862
        if (excludeId is { } id)
        {
            query = query.Where(m => m.Id != id);
        }

        var matches = await query
            .OrderBy(m => m.Name)
            .Select(m => new { m.Id, m.Name, m.GenericName, m.BrandName, m.Strength, m.Form, m.Barcode })
            .Take(10)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (matches.Count == 0)
        {
            return [];
        }

        var ids = matches.Select(m => m.Id).ToList();
        var stock = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => ids.Contains(b.MedicineId) && !b.IsDisposed)
            .GroupBy(b => b.MedicineId)
            .Select(g => new { MedicineId = g.Key, OnHand = g.Sum(b => b.QuantityOnHand) })
            .ToDictionaryAsync(x => x.MedicineId, x => x.OnHand, cancellationToken)
            .ConfigureAwait(false);

        return matches
            .Select(m => new DuplicateMedicineDto(
                m.Id, m.Name, m.GenericName, m.BrandName, m.Strength, m.Form, m.Barcode,
                stock.GetValueOrDefault(m.Id)))
            .ToList();
    }

    /// <summary>409 when <paramref name="barcode"/> already belongs to another live medicine of the tenant.</summary>
    public static async Task EnsureBarcodeAvailableAsync(
        InventoryDbContext dbContext, string? barcode, Guid? excludeId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        string? normalized = Medicine.NormalizeBarcode(barcode);
        if (normalized is null)
        {
            return;
        }

        var owner = await dbContext.Medicines.AsNoTracking()
            .Where(m => m.Barcode == normalized && (excludeId == null || m.Id != excludeId))
            .Select(m => new { m.Name, m.Strength })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (owner is not null)
        {
            string label = string.IsNullOrWhiteSpace(owner.Strength) ? owner.Name : $"{owner.Name} {owner.Strength}";
            throw new CustomException(
                $"Barcode {normalized} is already used by {label}. Each barcode can belong to one medicine only.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    /// <summary>A random in-store EAN-13 no live or trashed medicine of the tenant uses yet.</summary>
    public static async Task<string> NewUnusedBarcodeAsync(InventoryDbContext dbContext, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        for (int attempt = 0; attempt < MaxBarcodeAttempts; attempt++)
        {
            string candidate = Ean13.NewInStoreCode();
            bool taken = await dbContext.Medicines
                .IgnoreQueryFilters([FSH.Framework.Persistence.QueryFilters.SoftDelete])
                .AnyAsync(m => m.Barcode == candidate, cancellationToken)
                .ConfigureAwait(false);
            if (!taken)
            {
                return candidate;
            }
        }

        // 10^11 codes per tenant: repeated collisions mean something is wrong, not bad luck.
        throw new InvalidOperationException("Could not generate an unused barcode.");
    }

    private static string CompactKey(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant();
}
