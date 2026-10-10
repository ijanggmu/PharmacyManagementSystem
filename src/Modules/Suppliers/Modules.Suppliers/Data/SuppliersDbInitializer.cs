using FSH.Framework.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.Documents;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Suppliers.Data;

public sealed partial class SuppliersDbInitializer(
    SuppliersDbContext dbContext,
    IBranchService branchService,
    IMediator mediator,
    ILogger<SuppliersDbInitializer> logger) : IDbInitializer
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).Any())
        {
            await dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("[Suppliers] applied migrations");
        }
    }

    /// <summary>
    /// No reference data to seed. Attributes supplier ledger entries recorded before branch scoping (BranchId null) to
    /// the tenant's default (main) branch, so per-branch AR/AP reconciliation includes them. Idempotent:
    /// once nothing is unassigned the update touches zero rows. Tenant-filtered by the context.
    /// </summary>
    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        await BackfillBranchAsync(cancellationToken).ConfigureAwait(false);
        await BackfillDocumentNumbersAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task BackfillBranchAsync(CancellationToken cancellationToken)
    {
        Guid? defaultBranchId = await branchService.GetDefaultBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (defaultBranchId is not { } branchId)
        {
            return; // Tenant has no branches yet.
        }

        int updated = await dbContext.SupplierLedgerEntries
            .Where(e => e.BranchId == null)
            .ExecuteUpdateAsync(u => u.SetProperty(e => e.BranchId, branchId), cancellationToken)
            .ConfigureAwait(false);

        if (updated > 0)
        {
            LogBranchBackfill(logger, updated, branchId);
        }
    }

    /// <summary>
    /// Fills in GRN and supplier bill numbers on purchase entries (and payments allocated to them) recorded before
    /// the numbers were carried on the purchasing events. Idempotent: only entries still missing a number are
    /// looked up. A receipt numbered by Purchasing's own seed in the same run (it seeds after Suppliers) is picked
    /// up on the next run.
    /// </summary>
    private async Task BackfillDocumentNumbersAsync(CancellationToken cancellationToken)
    {
        var entries = await dbContext.SupplierLedgerEntries
            .Where(e => e.ReferenceId != null
                && ((e.ReferenceType == "DirectGoodsReceipt" && e.DocumentNumber == null)
                    || (e.ReferenceType == "PurchaseOrder" && e.SupplierBillNumber == null)))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (entries.Count == 0)
        {
            return;
        }

        var numbers = await mediator.Send(
                new GetPurchaseDocumentNumbersQuery(
                    entries.Where(e => e.ReferenceType == "DirectGoodsReceipt").Select(e => e.ReferenceId!.Value).Distinct().ToList(),
                    entries.Where(e => e.ReferenceType == "PurchaseOrder").Select(e => e.ReferenceId!.Value).Distinct().ToList()),
                cancellationToken)
            .ConfigureAwait(false);
        var byId = numbers.ToDictionary(n => n.Id);

        int filled = 0;
        foreach (var entry in entries)
        {
            if (byId.TryGetValue(entry.ReferenceId!.Value, out var number)
                && (number.DocumentNumber is not null || number.SupplierBillNumber is not null))
            {
                entry.BackfillDocumentNumbers(number.DocumentNumber, number.SupplierBillNumber);
                filled++;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        if (filled > 0)
        {
            LogDocumentNumberBackfill(logger, filled);
        }
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Suppliers] filled document numbers on {EntryCount} supplier ledger entries")]
    private static partial void LogDocumentNumberBackfill(ILogger logger, int entryCount);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Suppliers] attributed {EntryCount} supplier ledger entries with no branch to the default branch {BranchId}")]
    private static partial void LogBranchBackfill(ILogger logger, int entryCount, Guid branchId);
}
