using System.Data;
using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Authorization;
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
/// <para>Consigned rows (<see cref="ImportOpeningStockCommand.ConsignmentSupplierId"/> for the whole file, or a row's
/// own <see cref="OpeningStockImportRow.ConsignmentSupplierId"/>) are received as their own lots with a
/// <see cref="ConsignmentPosition"/> for that supplier — what ReceiveConsignmentStock does for one medicine — and add
/// nothing to the voucher: the supplier still owns the stock, and settlement bills what sells.</para>
///
/// <para>With <see cref="ImportOpeningStockCommand.CreateMissingMedicines"/> (go-live setup) a medicine the list doesn't
/// have is created from its row first, in the same transaction. Creating medicines needs Medicines.Create and
/// consigned rows need Consignment.Receive, on top of the endpoint's Batches.Create.</para>
/// </summary>
public sealed class ImportOpeningStockCommandHandler(
    InventoryDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IUserPermissionService userPermissions)
    : ICommandHandler<ImportOpeningStockCommand, OpeningStockImportResult>
{
    public const string ReferenceType = "OpeningStockImport";

    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    public async ValueTask<OpeningStockImportResult> Handle(ImportOpeningStockCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        bool consignAll = command.ConsignmentSupplierId is not null;
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow + NepalOffset);

        var medicines = await LoadCandidatesAsync(command.Rows, cancellationToken).ConfigureAwait(false);
        var lots = await LoadLotsAsync(medicines.Select(m => m.Id).ToList(), branchId, cancellationToken).ConfigureAwait(false);

        var plan = OpeningStockImportPlanner.Plan(command.Rows, medicines, lots, today, consignAll, command.CreateMissingMedicines);
        string funding = consignAll || (plan.Count > 0 && plan.All(p => p.Consigned))
            ? OpeningStockImportModes.Consignment
            : StockFundingSources.Normalize(command.Funding);

        if (plan.Any(p => p.Consigned))
        {
            await EnsurePermissionAsync(InventoryPermissions.Consignment.Receive,
                "Receiving consignment stock needs the Receive Consignment permission.", cancellationToken).ConfigureAwait(false);
        }

        if (plan.Any(p => p.NewMedicine))
        {
            await EnsurePermissionAsync(InventoryPermissions.Medicines.Create,
                "Adding new medicines needs the Create Medicines permission.", cancellationToken).ConfigureAwait(false);
        }

        if (command.DryRun || plan.Any(p => p.Status == OpeningStockImportRowStatuses.Failed))
        {
            return Result(plan, funding, committed: false, command.DryRun, batchIds: null);
        }

        // Medicines, lots, positions and the opening-stock event commit together (the receipt service and the outbox
        // join this transaction).
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var medicineIds = await CreateNewMedicinesAsync(plan, cancellationToken).ConfigureAwait(false);
        var batchIds = new Guid?[plan.Count];

        // Card-only rows (go-live, no quantity) only add their medicine card above: no lot, nothing to value.
        var owned = Enumerable.Range(0, plan.Count)
            .Where(i => !plan[i].Consigned && plan[i].Status == OpeningStockImportRowStatuses.Received)
            .ToList();
        if (owned.Count > 0)
        {
            Guid importId = Guid.CreateVersion7();
            var received = await stockReceiptService.ReceiveAsync(
                new StockReceiptRequest(
                    ReferenceType,
                    importId,
                    owned.Select(i => Line(plan[i], medicineIds[i], plan[i].BatchNo)).ToList(),
                    BranchId: branchId),
                cancellationToken).ConfigureAwait(false);
            for (int k = 0; k < owned.Count; k++)
            {
                batchIds[owned[k]] = received[k].BatchId;
            }

            decimal ownedValue = owned.Sum(i => plan[i].Row.Quantity * plan[i].Row.CostPrice);
            DateTime receivedOnUtc = (command.AsOfDate ?? today).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            string subject = string.Create(CultureInfo.InvariantCulture, $"stock import of {owned.Count} line(s)");
            await OpeningStockPublisher.PublishAsync(
                outbox, currentUser, ownedValue,
                OpeningStockPublisher.NarrationFor(funding, $"Opening stock: {subject}", subject),
                branchId, cancellationToken, funding, receivedOnUtc).ConfigureAwait(false);
        }

        await ReceiveConsignedAsync(plan, medicineIds, batchIds, command.ConsignmentSupplierId, branchId, cancellationToken)
            .ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);

        return Result(plan, funding, committed: true, dryRun: false, batchIds.Select(id => id ?? Guid.Empty).ToList());
    }

    private static StockReceiptLine Line(OpeningStockPlanRow p, Guid medicineId, string? batchNo) => new(
        medicineId,
        batchNo,
        p.Row.ExpiryDate,
        p.Row.Quantity,
        p.Row.CostPrice,
        p.Row.SellingPrice ?? 0m,
        string.IsNullOrWhiteSpace(p.Row.RackLocation) ? null : p.Row.RackLocation.Trim());

    /// <summary>Creates each new medicine once (rows naming it share its placeholder) and returns every row's real
    /// medicine id.</summary>
    private async Task<Guid[]> CreateNewMedicinesAsync(IReadOnlyList<OpeningStockPlanRow> plan, CancellationToken cancellationToken)
    {
        var created = new Dictionary<Guid, Guid>();
        var ids = new Guid[plan.Count];
        for (int i = 0; i < plan.Count; i++)
        {
            var p = plan[i];
            if (!p.NewMedicine)
            {
                ids[i] = p.Medicine!.Id;
                continue;
            }

            if (!created.TryGetValue(p.Medicine!.Id, out var realId))
            {
                var medicine = Medicine.Create(
                    p.Medicine.Name,
                    string.IsNullOrWhiteSpace(p.Row.GenericName) ? null : p.Row.GenericName.Trim(),
                    categoryId: null,
                    reorderLevel: p.Row.ReorderLevel ?? 0m,
                    unitPrice: p.Row.SellingPrice ?? 0m,
                    costPrice: p.Row.CostPrice,
                    form: p.Medicine.Form,
                    strength: p.Medicine.Strength,
                    barcode: p.Medicine.Barcode,
                    unitsPerPack: p.Row.UnitsPerPack,
                    isTaxable: p.Row.IsTaxable ?? false);
                dbContext.Medicines.Add(medicine);
                realId = medicine.Id;
                created[p.Medicine.Id] = realId;
            }

            ids[i] = realId;
        }

        if (created.Count > 0)
        {
            // The lots reference the medicines, so they must exist before the receipt service opens lots.
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        return ids;
    }

    /// <summary>Each consigned row as its own lot plus its position, one receipt per supplier; no voucher.</summary>
    private async Task ReceiveConsignedAsync(
        IReadOnlyList<OpeningStockPlanRow> plan,
        Guid[] medicineIds,
        Guid?[] batchIds,
        Guid? fileSupplierId,
        Guid branchId,
        CancellationToken cancellationToken)
    {
        var bySupplier = Enumerable.Range(0, plan.Count)
            .Where(i => plan[i].Consigned)
            .GroupBy(i => (plan[i].Row.ConsignmentSupplierId ?? fileSupplierId)!.Value)
            .ToList();
        if (bySupplier.Count == 0)
        {
            return;
        }

        DateTime receivedAtUtc = DateTime.UtcNow;
        foreach (var group in bySupplier)
        {
            var rows = group.ToList();
            var received = await stockReceiptService.ReceiveAsync(
                new StockReceiptRequest(
                    "Consignment",
                    group.Key,
                    rows.Select(i => Line(
                        plan[i] with { Row = plan[i].Row with { ExpiryDate = plan[i].Row.ExpiryDate ?? MedicineBatch.NoExpiryDate } },
                        medicineIds[i],
                        // Same generated form as receiving one consignment, so the lot is never merged into an owned one.
                        plan[i].BatchNo ?? MedicineBatch.NormalizeBatchNo($"CONSIGN-{Guid.CreateVersion7():N}"))).ToList(),
                    BranchId: branchId),
                cancellationToken).ConfigureAwait(false);

            for (int k = 0; k < rows.Count; k++)
            {
                batchIds[rows[k]] = received[k].BatchId;
                dbContext.ConsignmentPositions.Add(ConsignmentPosition.Create(
                    group.Key, received[k].MedicineId, received[k].BatchId, received[k].BatchNo,
                    received[k].QuantityReceived, plan[rows[k]].Row.CostPrice, receivedAtUtc, branchId));
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task EnsurePermissionAsync(string permission, string message, CancellationToken cancellationToken)
    {
        Guid userId = currentUser.GetUserId();
        bool allowed = userId != Guid.Empty
            && await userPermissions.HasPermissionAsync(userId.ToString(), permission, cancellationToken).ConfigureAwait(false);
        if (!allowed)
        {
            throw new CustomException(message, (IEnumerable<string>?)null, HttpStatusCode.Forbidden);
        }
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
                p.NewMedicine ? null : p.Medicine?.Id,
                p.Medicine?.Label,
                batchIds is not null && i < batchIds.Count && batchIds[i] != Guid.Empty ? batchIds[i] : null,
                p.Errors,
                p.Warnings,
                p.NewMedicine,
                p.Consigned))
            .ToList();
        var ok = plan.Where(p => p.Status == OpeningStockImportRowStatuses.Received).ToList();

        return new OpeningStockImportResult(
            committed,
            dryRun,
            Received: ok.Count,
            Failed: plan.Count(p => p.Status == OpeningStockImportRowStatuses.Failed),
            TotalQuantity: ok.Sum(p => p.Row.Quantity),
            TotalValue: ok.Sum(p => p.Row.Quantity * p.Row.CostPrice),
            funding,
            rows,
            MedicinesOnly: plan.Count(p => p.Status == OpeningStockImportRowStatuses.CardOnly));
    }
}
