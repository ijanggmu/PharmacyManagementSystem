using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Services;

/// <summary>
/// A supplier's name identifies it within a tenant: two live suppliers with the same name (case- and
/// surrounding-whitespace-insensitive) would split one supplier's ledger and balance across two records.
/// Soft-deleted suppliers are excluded by the query filter. The partial unique index
/// IX_Suppliers_TenantId_NormalizedName backstops this check against concurrent creates.
/// </summary>
internal static class SupplierNameGuard
{
    /// <summary>409 when another live supplier of the tenant already uses <paramref name="name"/>.</summary>
    public static async Task EnsureAvailableAsync(
        SuppliersDbContext dbContext, string name, Guid? excludeId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (string.IsNullOrWhiteSpace(name))
        {
            return;
        }

        string key = name.Trim().ToUpperInvariant();

#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
        bool taken = await dbContext.Suppliers.AsNoTracking()
            .AnyAsync(s => s.Name.Trim().ToUpper() == key && (excludeId == null || s.Id != excludeId), cancellationToken)
            .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862

        if (taken)
        {
            throw new CustomException(
                $"A supplier named \"{name.Trim()}\" already exists. Use the existing supplier, or give this one a different name.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
