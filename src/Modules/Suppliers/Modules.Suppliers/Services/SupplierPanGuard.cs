using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Features.v1.Suppliers.ImportSuppliers;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Services;

/// <summary>
/// A supplier's PAN / VAT number identifies it to IRD (purchase register, TDS returns), so it must be a valid
/// Nepal PAN (9 digits) and two active suppliers must not share one — the same rules the supplier import applies
/// (<see cref="SupplierImportKeys"/>). Inactive and trashed suppliers are not counted.
/// </summary>
internal static class SupplierPanGuard
{
    public const string FormatMessage = "PAN / VAT number must be 9 digits.";

    /// <summary>Blank, or a valid PAN.</summary>
    public static bool IsBlankOrValid(string? pan) => string.IsNullOrWhiteSpace(pan) || SupplierImportKeys.IsValidPan(pan);

    /// <summary>The stored form: digits only (spaces removed); null when blank.</summary>
    public static string? Normalize(string? pan) => SupplierImportKeys.PanKey(pan);

    /// <summary>Whether an update changes the PAN (by its canonical form).</summary>
    public static bool Changes(string? stored, string? requested) =>
        !string.Equals(Normalize(stored), Normalize(requested), StringComparison.Ordinal);

    /// <summary>409 when another active supplier of the tenant already has <paramref name="pan"/>.</summary>
    public static async Task EnsureAvailableAsync(
        SuppliersDbContext dbContext, string? pan, Guid? excludeId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (Normalize(pan) is not { } key)
        {
            return;
        }

        // Stored PANs may carry spaces (typed before the rule existed), so they are compared in canonical form.
        var candidates = await dbContext.Suppliers.AsNoTracking()
            .Where(s => s.IsActive && s.TaxId != null && (excludeId == null || s.Id != excludeId))
            .Select(s => new { s.Name, s.TaxId })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var taken = candidates.Find(s => string.Equals(Normalize(s.TaxId), key, StringComparison.Ordinal));
        if (taken is not null)
        {
            throw new CustomException(
                $"PAN {key} already belongs to {taken.Name}. Use that supplier, or check the number.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
