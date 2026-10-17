using System.Data;
using System.Globalization;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.ImportOpeningStock;

/// <summary>
/// Receives a spreadsheet of stock for existing medicines at the current branch, all-or-nothing per file (at most
/// <see cref="OpeningStockImportLimits.MaxRows"/> rows).
///
/// <para>Plan first (<see cref="OpeningStockImportPlanner"/>): each row's medicine (id, barcode, or name + strength +
/// form) and lot (new, or an existing one at this branch with the same batch number and expiry) are resolved. If any
/// row fails — or it's a dry run — the plan is returned and nothing is written.</para>
///
/// <para>Otherwise, in one transaction: every line goes through <see cref="IStockReceiptService"/> — the receipt path
/// add-stock and Purchasing use (existing lots locked before they're topped up, <c>Purchase</c> inventory transactions
/// referenced to this import) — and the file's total value (quantity × cost) posts one
/// <see cref="OpeningStockReceivedIntegrationEvent"/> through the outbox with the file's funding: opening stock
/// (Dr Inventory / Cr Owner's Equity) or stock bought for cash / by bank without a supplier bill (Cr Cash / Bank),
/// dated at the as-of date. Stock and voucher commit together.</para>
///
/// <para>A consignment import (<see cref="ImportOpeningStockCommand.ConsignmentSupplierId"/>) receives each row as its
/// own lot with a <see cref="ConsignmentPosition"/> for that supplier — what ReceiveConsignmentStock does for one
/// medicine — and posts no voucher: the supplier still owns the stock, and settlement bills what sells.</para>
/// </summary>
public sealed class ImportOpeningStockCommandHandler(
    InventoryDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch)
    : ICommandHandler<ImportOpeningStockCommand, OpeningStockImportResult>
{
    public const string ReferenceType = "OpeningStockImport";

    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    public async ValueTask<OpeningStockImportResult> Handle(ImportOpeningStockCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        bool consignment = command.ConsignmentSupplierId is not null;
        string funding = consignment ? OpeningStockImportModes.Consignment : StockFundingSources.Normalize(command.Funding);
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow + NepalOffset);

        var medicines = await LoadCandidatesAsync(command.Rows, cancellationToken).ConfigureAwait(false);
        var lots = await LoadLotsAsync(medicines.Select(m => m.Id).ToList(), branchId, cancellationToken).ConfigureAwait(false);

        var plan = OpeningStockImportPlanner.Plan(command.Rows, medicines, lots, today, consignment);
        if (command.DryRun || plan.Any(p => p.Status == OpeningStockImportRowStatuses.Failed))
        {
            return Result(plan, funding, committed: false, command.DryRun, batchIds: null);
        }

        if (consignment)
        {
            var lotIds = await ReceiveConsignmentAsync(plan, command.ConsignmentSupplierId!.Value, branchId, cancellationToken)
                .ConfigureAwait(false);
            return Result(plan, funding, committed: true, dryRun: false, lotIds);
        }

        Guid importId = Guid.CreateVersion7();
        decimal totalValue = plan.Sum(p => p.Row.Quantity * p.Row.CostPrice);
        DateTime receivedOnUtc = (command.AsOfDate ?? today).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

        // The lots and the opening-stock event commit together (the receipt service and the outbox join this transaction).
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var received = await stockReceiptService.ReceiveAsync(
            new StockReceiptRequest(
                ReferenceType,
                importId,
                plan.Select(p => new StockReceiptLine(
                    p.Medicine!.Id,
                    p.BatchNo,
                    p.Row.ExpiryDate,
                    p.Row.Quantity,
                    p.Row.CostPrice,
                    p.Row.SellingPrice ?? 0m,
                    string.IsNullOrWhiteSpace(p.Row.RackLocation) ? null : p.Row.RackLocation.Trim())).ToList(),
                BranchId: branchId),
            cancellationToken).ConfigureAwait(false);

        string subject = string.Create(CultureInfo.InvariantCulture, $"stock import of {plan.Count} line(s)");
        await OpeningStockPublisher.PublishAsync(
            outbox, currentUser, totalValue,
            OpeningStockPublisher.NarrationFor(funding, $"Opening stock: {subject}", subject),
            branchId, cancellationToken, funding, receivedOnUtc).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);

        return Result(plan, funding, committed: true, dryRun: false, received.Select(r => r.BatchId).ToList());
    }

    /// <summary>Each row as its own consigned lot plus its position, in one transaction; no voucher.</summary>
    private async Task<List<Guid>> ReceiveConsignmentAsync(
        IReadOnlyList<OpeningStockPlanRow> plan, Guid supplierId, Guid branchId, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var received = await stockReceiptService.ReceiveAsync(
            new StockReceiptRequest(
                "Consignment",
                supplierId,
                plan.Select(p => new StockReceiptLine(
                    p.Medicine!.Id,
                    // Same generated form as receiving one consignment, so the lot is never merged into an owned one.
                    p.BatchNo ?? MedicineBatch.NormalizeBatchNo($"CONSIGN-{Guid.CreateVersion7():N}"),
                    p.Row.ExpiryDate ?? MedicineBatch.NoExpiryDate,
                    p.Row.Quantity,
                    p.Row.CostPrice,
                    p.Row.SellingPrice ?? 0m,
                    string.IsNullOrWhiteSpace(p.Row.RackLocation) ? null : p.Row.RackLocation.Trim())).ToList(),
                BranchId: branchId),
            cancellationToken).ConfigureAwait(false);

        DateTime receivedAtUtc = DateTime.UtcNow;
        for (int i = 0; i < received.Count; i++)
        {
            dbContext.ConsignmentPositions.Add(ConsignmentPosition.Create(
                supplierId, received[i].MedicineId, received[i].BatchId, received[i].BatchNo,
                received[i].QuantityReceived, plan[i].Row.CostPrice, receivedAtUtc, branchId));
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return received.Select(r => r.BatchId).ToList();
    }

    /// <summary>The medicines any row could mean: by id, by barcode, and by name (strength/form matched in memory).</summary>
    private async Task<List<OpeningStockMedicine>> LoadCandidatesAsync(
        IReadOnlyList<OpeningStockImportRow> rows, CancellationToken cancellationToken)
    {
        var ids = rows.Where(r => r.MedicineId is not null).Select(r => r.MedicineId!.Value).Distinct().ToList();
        var barcodes = rows.Where(r => !string.IsNullOrWhiteSpace(r.Barcode)).Select(r => r.Barcode!.Trim()).Distinct().ToList();
        var names = rows.Where(r => !string.IsNullOrWhiteSpace(r.MedicineName))
            .Select(r => r.MedicineName!.Trim().ToUpperInvariant()).Distinct().ToList();

#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
        return await dbContext.Medicines.AsNoTracking()
            .Where(m => ids.Contains(m.Id)
                || (m.Barcode != null && barcodes.Contains(m.Barcode))
                || names.Contains(m.Name.Trim().ToUpper()))
            .Select(m => new OpeningStockMedicine(m.Id, m.Name, m.Strength, m.Form, m.Barcode))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862
    }

    /// <summary>The live lots of those medicines at this branch, flagged when they hold consigned stock.</summary>
    private async Task<List<OpeningStockLot>> LoadLotsAsync(
        List<Guid> medicineIds, Guid branchId, CancellationToken cancellationToken)
    {
        if (medicineIds.Count == 0)
        {
            return [];
        }

        var lots = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => medicineIds.Contains(b.MedicineId) && b.BranchId == branchId && !b.IsDisposed)
            .Select(b => new { b.Id, b.MedicineId, b.BatchNo, b.ExpiryDate, b.QuantityOnHand })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var lotIds = lots.Select(l => l.Id).ToList();
        var consigned = lotIds.Count == 0
            ? []
            : (await dbContext.ConsignmentPositions.AsNoTracking()
                .Where(p => lotIds.Contains(p.BatchId))
                .Select(p => p.BatchId)
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false)).ToHashSet();

        return lots
            .Select(l => new OpeningStockLot(
                l.MedicineId, MedicineBatch.NormalizeBatchNo(l.BatchNo), l.ExpiryDate, l.QuantityOnHand, consigned.Contains(l.Id)))
            .ToList();
    }

    private static OpeningStockImportResult Result(
        IReadOnlyList<OpeningStockPlanRow> plan, string funding, bool committed, bool dryRun, List<Guid>? batchIds)
    {
        var rows = plan
            .Select((p, i) => new OpeningStockImportRowResult(
                p.Row.RowNumber,
                p.Status,
                p.Medicine?.Id,
                p.Medicine?.Label,
                batchIds is not null && i < batchIds.Count ? batchIds[i] : null,
                p.Errors,
                p.Warnings))
            .ToList();
        var ok = plan.Where(p => p.Status == OpeningStockImportRowStatuses.Received).ToList();

        return new OpeningStockImportResult(
            committed,
            dryRun,
            Received: ok.Count,
            Failed: plan.Count - ok.Count,
            TotalQuantity: ok.Sum(p => p.Row.Quantity),
            TotalValue: ok.Sum(p => p.Row.Quantity * p.Row.CostPrice),
            funding,
            rows);
    }
}
