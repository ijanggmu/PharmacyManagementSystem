using System.Data;
using FSH.Framework.Persistence;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Customers.Data;

public sealed partial class CustomersDbInitializer(
    CustomersDbContext dbContext,
    IBranchService branchService,
    IMediator mediator,
    ICustomerReceiptNumberService receiptNumbers,
    ILogger<CustomersDbInitializer> logger) : IDbInitializer
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).Any())
        {
            await dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("[Customers] applied migrations");
        }
    }

    /// <summary>
    /// No reference data to seed. Attributes customer ledger entries recorded before branch scoping (BranchId null) to
    /// the tenant's default (main) branch, so per-branch AR/AP reconciliation includes them. Idempotent:
    /// once nothing is unassigned the update touches zero rows. Tenant-filtered by the context.
    /// </summary>
    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        await BackfillBranchAsync(cancellationToken).ConfigureAwait(false);
        await BackfillSaleInvoiceNumbersAsync(cancellationToken).ConfigureAwait(false);
        await BackfillPaymentReceiptNumbersAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task BackfillBranchAsync(CancellationToken cancellationToken)
    {
        Guid? defaultBranchId = await branchService.GetDefaultBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (defaultBranchId is not { } branchId)
        {
            return; // Tenant has no branches yet.
        }

        int updated = await dbContext.CustomerLedgerEntries
            .Where(e => e.BranchId == null)
            .ExecuteUpdateAsync(u => u.SetProperty(e => e.BranchId, branchId), cancellationToken)
            .ConfigureAwait(false);

        if (updated > 0)
        {
            LogBranchBackfill(logger, updated, branchId);
        }
    }

    /// <summary>Copies the sale's IRD invoice number onto AR entries recorded before the number was carried
    /// on the sale event. Idempotent: only entries without a number are looked up.</summary>
    private async Task BackfillSaleInvoiceNumbersAsync(CancellationToken cancellationToken)
    {
        var entries = await dbContext.CustomerLedgerEntries
            .Where(e => e.ReferenceType == "Sale" && e.ReferenceId != null && e.DocumentNumber == null)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (entries.Count == 0)
        {
            return;
        }

        var numbers = (await mediator.Send(
                    new GetSaleInvoiceNumbersQuery(entries.Select(e => e.ReferenceId!.Value).Distinct().ToList()),
                    cancellationToken)
                .ConfigureAwait(false))
            .Where(n => n.InvoiceNumber is not null)
            .ToDictionary(n => n.SaleId, n => n.InvoiceNumber!);

        int filled = 0;
        foreach (var entry in entries)
        {
            if (numbers.TryGetValue(entry.ReferenceId!.Value, out string? invoiceNumber))
            {
                entry.BackfillDocumentNumber(invoiceNumber);
                filled++;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        if (filled > 0)
        {
            LogDocumentNumberBackfill(logger, filled);
        }
    }

    /// <summary>Gives payments recorded before receipt numbering their RCP number, oldest first, so each branch and
    /// fiscal year series follows the order the money came in. Idempotent: only unnumbered payments are touched.</summary>
    private async Task BackfillPaymentReceiptNumbersAsync(CancellationToken cancellationToken)
    {
        var payments = await dbContext.CustomerLedgerEntries
            .Where(e => e.EntryType == CustomerLedgerEntryType.Payment && e.DocumentNumber == null && e.BranchId != null)
            .OrderBy(e => e.EntryDateUtc)
            .ThenBy(e => e.CreatedAtUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (payments.Count == 0)
        {
            return;
        }

        var branchCodes = (await branchService.GetAllForCurrentTenantAsync(cancellationToken).ConfigureAwait(false))
            .ToDictionary(b => b.Id, b => b.Code.Trim().ToUpperInvariant());

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        int numbered = 0;
        foreach (var payment in payments)
        {
            if (!branchCodes.TryGetValue(payment.BranchId!.Value, out string? branchCode))
            {
                continue; // Branch no longer exists for this tenant — leave it unnumbered rather than guess.
            }

            int fiscalYear = NepalFiscalYear.StartYearFor(payment.EntryDateUtc);
            int sequence = await receiptNumbers.ReserveNextAsync(payment.BranchId.Value, fiscalYear, cancellationToken).ConfigureAwait(false);
            payment.BackfillDocumentNumber(CustomerReceiptNumberService.Format(branchCode, fiscalYear, sequence));
            numbered++;
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        if (numbered > 0)
        {
            LogDocumentNumberBackfill(logger, numbered);
        }
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Customers] filled document numbers on {EntryCount} customer ledger entries")]
    private static partial void LogDocumentNumberBackfill(ILogger logger, int entryCount);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Customers] attributed {EntryCount} customer ledger entries with no branch to the default branch {BranchId}")]
    private static partial void LogBranchBackfill(ILogger logger, int entryCount, Guid branchId);
}
