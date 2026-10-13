using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Services;

/// <summary>Who delivered a lot, and how sure we are.</summary>
internal sealed record LotAttribution(Guid? SupplierId, string Source)
{
    public const string Receipt = "Receipt";
    public const string PreferredSupplier = "PreferredSupplier";
    public const string Unknown = "Unknown";

    /// <summary>A receipt proves the supplier; the other sources are only a guess.</summary>
    public bool IsProven => Source == Receipt;
}

/// <summary>Shared lookups of the expiry claim handlers.</summary>
internal static class ExpiryClaimLots
{
    /// <summary>
    /// Attributes each lot to the supplier that delivered it: the goods receipt line that recorded the lot,
    /// else the receipt documents of the lot's purchase movements (oldest first), else the medicine's preferred
    /// supplier, else unknown.
    /// </summary>
    public static async Task<Dictionary<Guid, LotAttribution>> AttributeAsync(
        IMediator mediator, IReadOnlyList<BatchSourceDto> lots, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(mediator);
        ArgumentNullException.ThrowIfNull(lots);

        var result = new Dictionary<Guid, LotAttribution>();
        if (lots.Count == 0)
        {
            return result;
        }

        var suppliers = await mediator.Send(
            new GetLotSuppliersQuery(
                lots.Select(l => l.BatchId).ToList(),
                lots.SelectMany(l => l.ReceiptReferenceIds).Distinct().ToList()),
            cancellationToken).ConfigureAwait(false);

        foreach (var lot in lots)
        {
            if (suppliers.SupplierByBatchId.TryGetValue(lot.BatchId, out Guid bySupplierLine))
            {
                result[lot.BatchId] = new LotAttribution(bySupplierLine, LotAttribution.Receipt);
                continue;
            }

            Guid? byReceipt = lot.ReceiptReferenceIds
                .Where(id => suppliers.SupplierByReceiptId.ContainsKey(id))
                .Select(id => (Guid?)suppliers.SupplierByReceiptId[id])
                .FirstOrDefault();
            if (byReceipt is not null)
            {
                result[lot.BatchId] = new LotAttribution(byReceipt, LotAttribution.Receipt);
            }
            else if (lot.PreferredSupplierId is { } preferred)
            {
                result[lot.BatchId] = new LotAttribution(preferred, LotAttribution.PreferredSupplier);
            }
            else
            {
                result[lot.BatchId] = new LotAttribution(null, LotAttribution.Unknown);
            }
        }

        return result;
    }

    /// <summary>Units of each lot held by open (draft / sent) claims, optionally ignoring one claim.</summary>
    public static async Task<Dictionary<Guid, decimal>> OpenClaimedAsync(
        SuppliersDbContext dbContext, IReadOnlyCollection<Guid> batchIds, Guid? exceptClaimId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (batchIds.Count == 0)
        {
            return [];
        }

        var rows = await (
            from line in dbContext.ExpiryClaimLines.AsNoTracking()
            join claim in dbContext.ExpiryClaims.AsNoTracking() on line.ExpiryClaimId equals claim.Id
            where batchIds.Contains(line.BatchId)
                && (claim.Status == ExpiryClaimStatus.Draft || claim.Status == ExpiryClaimStatus.Sent)
                && (exceptClaimId == null || claim.Id != exceptClaimId)
            select new { line.BatchId, line.Quantity })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.GroupBy(r => r.BatchId).ToDictionary(g => g.Key, g => g.Sum(r => r.Quantity));
    }
}
