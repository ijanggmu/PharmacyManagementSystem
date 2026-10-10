using System.Data;
using FSH.Framework.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Services;
using FSH.Modules.Sales.Contracts.Fiscal;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Purchasing.Data;

public sealed partial class PurchasingDbInitializer(
    PurchasingDbContext dbContext,
    IBranchService branchService,
    IReceiptNumberService receiptNumbers,
    ILogger<PurchasingDbInitializer> logger) : IDbInitializer
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).Any())
        {
            await dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("[Purchasing] applied migrations");
        }
    }

    /// <summary>No business seed — a fresh tenant starts with no purchase orders. Numbers any direct goods
    /// receipt created before receipt numbering existed.</summary>
    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        await BackfillOrderBranchesAsync(cancellationToken).ConfigureAwait(false);
        await BackfillReceiptNumbersAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Purchase orders raised before orders carried a branch are attributed to the tenant's default branch
    /// (the receiving branch was never recorded). Idempotent: once none are unassigned this touches no rows.
    /// </summary>
    private async Task BackfillOrderBranchesAsync(CancellationToken cancellationToken)
    {
        var unassigned = await dbContext.PurchaseOrders
            .Where(o => o.BranchId == null)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (unassigned.Count == 0)
        {
            return;
        }

        Guid? defaultBranchId = await branchService.GetDefaultBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (defaultBranchId is not { } branchId)
        {
            return;
        }

        foreach (var order in unassigned)
        {
            order.AssignLegacyBranch(branchId);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        LogOrdersAssigned(logger, unassigned.Count);
    }

    /// <summary>
    /// Gives every unnumbered receipt its serial, oldest first (receipt date, then entry time), so the
    /// series for each branch and fiscal year follows the order the receipts happened in. New receipts are
    /// numbered when they are created; once nothing is unnumbered this touches no rows. Tenant-filtered by
    /// the context's query filter.
    /// </summary>
    private async Task BackfillReceiptNumbersAsync(CancellationToken cancellationToken)
    {
        var unnumbered = await dbContext.DirectGoodsReceipts
            .Where(r => r.ReceiptNumber == null)
            .OrderBy(r => r.ReceiptDateUtc)
            .ThenBy(r => r.CreatedAtUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (unnumbered.Count == 0)
        {
            return;
        }

        var branchCodes = (await branchService.GetAllForCurrentTenantAsync(cancellationToken).ConfigureAwait(false))
            .ToDictionary(b => b.Id, b => b.Code.Trim().ToUpperInvariant());

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        int numbered = 0;
        foreach (var receipt in unnumbered)
        {
            if (!branchCodes.TryGetValue(receipt.BranchId, out string? branchCode))
            {
                continue; // Branch no longer exists for this tenant — leave it unnumbered rather than guess.
            }

            int fiscalYear = NepalFiscalYear.StartYearFor(receipt.ReceiptDateUtc);
            int sequence = await receiptNumbers.ReserveNextAsync(receipt.BranchId, fiscalYear, cancellationToken).ConfigureAwait(false);
            receipt.AssignNumber(ReceiptNumberService.Format(branchCode, fiscalYear, sequence), fiscalYear);
            numbered++;
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);

        LogReceiptsNumbered(logger, numbered);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "[Purchasing] attributed {Count} legacy purchase orders to the default branch")]
    private static partial void LogOrdersAssigned(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Information, Message = "[Purchasing] numbered {Count} existing direct goods receipts")]
    private static partial void LogReceiptsNumbered(ILogger logger, int count);
}
