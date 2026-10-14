using System.Data;
using System.Diagnostics;
using System.Globalization;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Suppliers.Features.v1.Returns.CreateSupplierReturn;

/// <summary>
/// Records goods sent back to a supplier as a numbered debit note:
///
/// 1. R5 (domain audit) — per medicine, the TOTAL quantity across every line of the request cannot exceed
///    what was ever received from this supplier (received purchase orders plus non-voided direct goods
///    receipts) minus what's already been returned. A medicine never received from this supplier can't be
///    returned to them at all.
/// 2. Stock leaves the named batch (or oldest-expiring first) via Inventory's
///    <see cref="IStockDeductionService"/>. The debit note is VALUED AT THE COST OF THE LOTS THAT ACTUALLY
///    LEFT STOCK (<see cref="BatchDeductionDetail.UnitCostPrice"/>), one debit-note line per lot, never at
///    the client-supplied <see cref="SupplierReturnItemInput.UnitCost"/>, which is informational only.
///    That keeps Accounting's Cr Inventory equal to the inventory value removed, and the AP/VAT reversal
///    consistent with it. A supplier who credits a different price is a separate settlement, not an input
///    to the return's valuation.
/// 3. Input VAT is reversed on taxable lines at the pharmacy's VAT rate when the goods came on a VAT bill
///    (<see cref="CreateSupplierReturnCommand.ReverseInputVat"/>), computed here on the lot cost.
/// 4. The supplier row is locked, the debit-note number is reserved and the AP subledger is credited by
///    cost + VAT, all in ONE transaction on the scope's shared connection together with the stock deduction,
///    so a return is never recorded without its stock movement, or the other way round.
/// 5. Accounting posts Dr Accounts Payable / Cr Inventory + Cr Input VAT asynchronously off
///    <see cref="SupplierReturnCreatedIntegrationEvent"/> via the Outbox (written in the same transaction).
///
/// Everything another module answers (medicines, settings, branch code, received quantities) is read
/// before the transaction opens, the same rule Sales follows.
/// </summary>
public sealed partial class CreateSupplierReturnCommandHandler(
    SuppliersDbContext dbContext,
    IStockDeductionService stockDeductionService,
    IMediator mediator,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    ISupplierDebitNoteNumberService debitNoteNumbers,
    ILogger<CreateSupplierReturnCommandHandler> logger) : ICommandHandler<CreateSupplierReturnCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateSupplierReturnCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        bool supplierExists = await dbContext.Suppliers
            .AnyAsync(s => s.Id == command.SupplierId, cancellationToken)
            .ConfigureAwait(false);
        if (!supplierExists)
        {
            throw new NotFoundException($"Supplier {command.SupplierId} not found.");
        }

        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        string branchCode = await debitNoteNumbers.ResolveBranchCodeAsync(branchId, cancellationToken).ConfigureAwait(false);
        decimal vatRate = command.ReverseInputVat
            ? (await mediator.Send(new GetPharmacySettingsQuery(), cancellationToken).ConfigureAwait(false)).VatRatePercent
            : 0m;

        // Checked per medicine over the WHOLE request: two lines of the same medicine share one allowance.
        // What was received comes from Purchasing and is read here, outside the transaction; what was already
        // returned is (re)read under the supplier lock below, so two concurrent returns can't both fit the same
        // allowance. The early check just fails fast.
        var requestedByMedicine = command.Items
            .GroupBy(i => i.MedicineId)
            .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var receivedByMedicine = new Dictionary<Guid, decimal>();
        foreach (var (medicineId, requested) in requestedByMedicine)
        {
            decimal received = await mediator.Send(
                new GetSupplierReceivedQuantityQuery(command.SupplierId, medicineId), cancellationToken)
                .ConfigureAwait(false);
            receivedByMedicine[medicineId] = received;
            await EnsureWithinReceivedAsync(command.SupplierId, medicineId, received, requested, cancellationToken)
                .ConfigureAwait(false);
        }

        // A pinned lot must be one this supplier delivered.
        foreach (var item in command.Items.Where(i => i.BatchId is not null).DistinctBy(i => (i.MedicineId, i.BatchId)))
        {
            await EnsurePinnedLotFromSupplierAsync(command.SupplierId, item.MedicineId, item.BatchId!.Value, cancellationToken)
                .ConfigureAwait(false);
        }

        var medicines = new Dictionary<Guid, string>();
        foreach (var medicineId in command.Items.Select(i => i.MedicineId).Distinct())
        {
            var medicine = await mediator.Send(new GetMedicineByIdQuery(medicineId), cancellationToken).ConfigureAwait(false);
            string medicineName = string.Join(' ', new[] { medicine.Name, medicine.Strength }.Where(s => !string.IsNullOrWhiteSpace(s)));
            medicines[medicineId] = medicineName;
        }

        string? tenant = currentUser.GetTenant();

        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            // A caller that already opened a transaction (an accepted expiry claim) owns it: the return joins it
            // and its owner commits, so the claim and its debit note commit or roll back together.
            await using var transaction = dbContext.Database.IsRelational() && dbContext.Database.CurrentTransaction is null
                ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken).ConfigureAwait(false)
                : null;

            // Serializes this return's AP credit with every other write to the supplier's account.
            var supplier = await SupplierRowLock.LockAsync(dbContext, command.SupplierId, cancellationToken).ConfigureAwait(false);

            // Re-checked under the lock: a return committed since the early check counts now.
            foreach (var (medicineId, requested) in requestedByMedicine)
            {
                await EnsureWithinReceivedAsync(
                    command.SupplierId, medicineId, receivedByMedicine[medicineId], requested, cancellationToken)
                    .ConfigureAwait(false);
            }

            var supplierReturn = SupplierReturn.Create(supplier.Id, command.ReturnDateUtc, command.Notes, branchId);

            var deductions = await stockDeductionService.DeductForSupplierReturnAsync(
                new StockDeductionRequest(
                    ReferenceType: "SupplierReturn",
                    ReferenceId: supplierReturn.Id,
                    Lines: command.Items.Select(i => new StockDeductionLine(i.MedicineId, i.Quantity, i.BatchId)).ToList()),
                cancellationToken).ConfigureAwait(false);

            // One debit-note line per lot that left stock, valued at that lot's cost.
            var matched = MatchDeductions(command.Items, deductions);
            for (int i = 0; i < command.Items.Count; i++)
            {
                var input = command.Items[i];
                string name = medicines[input.MedicineId];
                var lots = matched[i]?.Batches ?? [];
                if (lots.Count == 0)
                {
                    throw new CustomException(
                        $"No stock was deducted for {name}, so the return can not be valued.",
                        (IEnumerable<string>?)null, HttpStatusCode.Conflict);
                }

                foreach (var lot in lots)
                {
                    // The VAT the lot was bought under, not the medicine's flag today: a corrected flag
                    // must not change the input VAT reversed on stock bought before the correction.
                    decimal lotVat = lot.IsTaxable && vatRate > 0
                        ? Math.Round(lot.QuantityDeducted * lot.UnitCostPrice * vatRate / 100m, 2, MidpointRounding.AwayFromZero)
                        : 0m;
                    var item = supplierReturn.AddItem(
                        input.MedicineId, lot.QuantityDeducted, lot.UnitCostPrice, input.ReturnReason, input.Notes, name, lotVat);
                    item.RecordBatch(lot.BatchId, lot.BatchNo);
                }
            }

            int fiscalYear = NepalFiscalYear.StartYearFor(command.ReturnDateUtc);
            int sequence = await debitNoteNumbers.ReserveNextAsync(branchId, fiscalYear, cancellationToken).ConfigureAwait(false);
            string documentNumber = SupplierDebitNoteNumberService.Format(branchCode, fiscalYear, sequence);
            supplierReturn.AssignDocument(documentNumber, command.SupplierInvoiceNumber);

            // A return reduces what the pharmacy owes by cost + the VAT the bill charged on it.
            decimal total = supplierReturn.TotalAmount;
            decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: 0m, creditAmount: total);
            dbContext.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
                supplier.Id, command.ReturnDateUtc, SupplierLedgerEntryType.Return,
                $"Debit note {documentNumber}{(string.IsNullOrWhiteSpace(command.Notes) ? string.Empty : $" — {command.Notes.Trim()}")}",
                debitAmount: 0m, creditAmount: total,
                runningBalance: newBalance, referenceType: "SupplierReturn", referenceId: supplierReturn.Id, branchId: branchId,
                documentNumber: documentNumber));

            dbContext.SupplierReturns.Add(supplierReturn);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            if (total > 0)
            {
                await outbox.AddAsync(new SupplierReturnCreatedIntegrationEvent(
                    Id: Guid.NewGuid(),
                    OccurredOnUtc: DateTime.UtcNow,
                    TenantId: tenant,
                    CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                    Source: "Suppliers",
                    SupplierReturnId: supplierReturn.Id,
                    SupplierId: supplier.Id,
                    TotalCost: supplierReturn.TotalCost,
                    BranchId: branchId,
                    ReturnDateUtc: command.ReturnDateUtc,
                    VatAmount: supplierReturn.VatAmount,
                    DocumentNumber: documentNumber),
                    cancellationToken).ConfigureAwait(false);
            }

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            }

            return supplierReturn.Id;
        }).ConfigureAwait(false);
    }

    /// <summary>
    /// Pairs each requested line with its deduction result. Matched on content (medicine, the named lot,
    /// the quantity) rather than position, so it doesn't depend on the order the deduction service returns
    /// its results in (it processes lines that name a lot before oldest-expiring-first lines).
    /// </summary>
    internal static StockDeductionLineResult?[] MatchDeductions(
        IReadOnlyList<SupplierReturnItemInput> items, IReadOnlyList<StockDeductionLineResult> deductions)
    {
        ArgumentNullException.ThrowIfNull(items);
        ArgumentNullException.ThrowIfNull(deductions);

        var matched = new StockDeductionLineResult?[items.Count];
        var used = new bool[deductions.Count];

        foreach (bool strict in new[] { true, false })
        {
            for (int i = 0; i < items.Count; i++)
            {
                if (matched[i] is not null)
                {
                    continue;
                }

                for (int j = 0; j < deductions.Count; j++)
                {
                    if (!used[j] && Fits(items[i], deductions[j], strict))
                    {
                        matched[i] = deductions[j];
                        used[j] = true;
                        break;
                    }
                }
            }
        }

        return matched;
    }

    private static bool Fits(SupplierReturnItemInput item, StockDeductionLineResult result, bool strict) =>
        result.MedicineId == item.MedicineId
        && (!strict || (result.QuantityDeducted == item.Quantity
            && (item.BatchId is not { } pinned || result.Batches.All(b => b.BatchId == pinned))));

    private async Task EnsurePinnedLotFromSupplierAsync(
        Guid supplierId, Guid medicineId, Guid batchId, CancellationToken cancellationToken)
    {
        var lots = await mediator.Send(new GetSupplierReceivedLotsQuery(supplierId, medicineId), cancellationToken)
            .ConfigureAwait(false);
        if (lots.BatchIds.Contains(batchId))
        {
            return;
        }

        if (lots.HasUntrackedReceipts || lots.BatchIds.Count == 0)
        {
            // Some receipts (purchase orders, older direct receipts) don't record their lot, or there is no
            // receipt history at all: the lot can't be proven foreign, so the return is allowed.
            LogUnverifiedLot(logger, batchId, medicineId, supplierId);
            return;
        }

        throw new CustomException(
            "The selected batch was not received from this supplier. Pick a batch this supplier delivered.",
            (IEnumerable<string>?)null, HttpStatusCode.Conflict);
    }

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Supplier return pins batch {BatchId} of medicine {MedicineId}, which is not among supplier {SupplierId}'s recorded receipt lots; allowed because some receipts don't record their lot")]
    private static partial void LogUnverifiedLot(ILogger logger, Guid batchId, Guid medicineId, Guid supplierId);

    private async Task EnsureWithinReceivedAsync(
        Guid supplierId, Guid medicineId, decimal received, decimal requested, CancellationToken cancellationToken)
    {
        // Nothing received from this supplier (stock from opening balances, another supplier, or bought before
        // receipts were tracked) can't go back to them: the debit note would reverse input VAT never claimed.
        if (received <= 0)
        {
            throw new CustomException(
                "Nothing of this medicine was received from this supplier, so it can't be returned to them. Return it to the supplier that delivered it.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        decimal alreadyReturned = await (
            from item in dbContext.SupplierReturnItems
            join ret in dbContext.SupplierReturns on item.SupplierReturnId equals ret.Id
            where ret.SupplierId == supplierId && item.MedicineId == medicineId
            select item.Quantity)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal eligible = received - alreadyReturned;
        if (requested > eligible)
        {
            throw new CustomException(
                string.Create(
                    CultureInfo.InvariantCulture,
                    $"Only {Math.Max(0, eligible)} can go back to this supplier (received {received}, already returned {alreadyReturned}); this return asks for {requested}."),
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
