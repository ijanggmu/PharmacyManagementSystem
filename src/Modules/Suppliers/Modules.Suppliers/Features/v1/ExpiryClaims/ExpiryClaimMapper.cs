using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims;

internal static class ExpiryClaimMapper
{
    public static ExpiryClaimDto ToDto(ExpiryClaim c, string? supplierName, bool includeLines = true) =>
        new(c.Id, c.ClaimNumber, c.SupplierId, supplierName, c.BranchId, c.Status.ToString(), c.Notes,
            c.CreatedAtUtc, c.SentAtUtc, c.RespondedAtUtc, c.CreditedAtUtc, c.SupplierReturnId, c.DebitNoteNumber,
            c.SupplierCreditNoteNumber, c.RejectionReason,
            Math.Round(c.ClaimedValue, 2, MidpointRounding.AwayFromZero),
            Math.Round(c.AcceptedValue, 2, MidpointRounding.AwayFromZero),
            c.Lines.Count,
            includeLines
                ? c.Lines
                    .OrderBy(l => l.ExpiryDate).ThenBy(l => l.MedicineName)
                    .Select(l => new ExpiryClaimLineDto(
                        l.Id, l.MedicineId, l.MedicineName, l.BatchId, l.BatchNo, l.ExpiryDate, l.Quantity, l.UnitCost,
                        Math.Round(l.Quantity * l.UnitCost, 2, MidpointRounding.AwayFromZero), l.AcceptedQuantity))
                    .ToList()
                : []);

    /// <summary>The claim with its lines, tracked; 404 when missing or at a branch the caller can't see.</summary>
    public static async Task<ExpiryClaim> LoadAsync(
        SuppliersDbContext dbContext, ICurrentBranch currentBranch, Guid claimId, CancellationToken cancellationToken)
    {
        string notFound = $"Expiry claim {claimId} not found.";
        var claim = await dbContext.ExpiryClaims
            .Include(c => c.Lines)
            .FirstOrDefaultAsync(c => c.Id == claimId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(claim.BranchId, notFound, cancellationToken).ConfigureAwait(false);
        return claim;
    }

    /// <summary>Locks the claim row (relational; inside a transaction) and returns it tracked with its committed
    /// status, so a status change and an acceptance of the same claim serialize.</summary>
    public static async Task<ExpiryClaim> LockAsync(
        SuppliersDbContext dbContext, ICurrentBranch currentBranch, Guid claimId, CancellationToken cancellationToken)
    {
        if (dbContext.Database.IsRelational())
        {
            await dbContext.Database.SqlQuery<Guid>($"""
                SELECT "Id" FROM suppliers."ExpiryClaims" WHERE "Id" = {claimId} FOR UPDATE
                """).ToListAsync(cancellationToken).ConfigureAwait(false);
        }

        return await LoadAsync(dbContext, currentBranch, claimId, cancellationToken).ConfigureAwait(false);
    }

    public static Task<string?> SupplierNameAsync(SuppliersDbContext dbContext, Guid supplierId, CancellationToken cancellationToken) =>
        dbContext.Suppliers.IgnoreQueryFilters([QueryFilters.SoftDelete]).AsNoTracking()
            .Where(s => s.Id == supplierId)
            .Select(s => (string?)s.Name)
            .FirstOrDefaultAsync(cancellationToken);
}
