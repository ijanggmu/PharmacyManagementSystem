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

namespace FSH.Modules.Suppliers.Features.v1.Returns.CreateSupplierReturn;

/// <summary>
/// Records goods sent back to a supplier as a numbered debit note:
///
/// 1. R5 (domain audit) — a line cannot return more than was ever received from this supplier for that
///    medicine, minus what's already been returned (only when receipt history exists, so stock that
///    predates receipt tracking isn't wrongly blocked).
/// 2. Input VAT is reversed on taxable lines at the pharmacy's VAT rate when the goods came on a VAT
///    bill (<see cref="CreateSupplierReturnCommand.ReverseInputVat"/>) — computed here, never trusted
///    from the client.
/// 3. Stock leaves the named batch (or oldest-expiring first) via Inventory's
///    <see cref="IStockDeductionService"/>, the debit-note number is reserved, and the AP subledger is
///    credited by cost + VAT — all in ONE transaction on the scope's shared connection, so a return is
///    never recorded without its stock movement, or the other way round.
/// 4. Accounting posts Dr Accounts Payable / Cr Inventory + Cr Input VAT asynchronously off
///    <see cref="SupplierReturnCreatedIntegrationEvent"/> via the Outbox (written in the same transaction).
///
/// Everything another module answers (medicines, settings, branch code, received quantities) is read
/// before the transaction opens, the same rule Sales follows.
/// </summary>
public sealed class CreateSupplierReturnCommandHandler(
    SuppliersDbContext dbContext,
    IStockDeductionService stockDeductionService,
    IMediator mediator,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    ISupplierDebitNoteNumberService debitNoteNumbers) : ICommandHandler<CreateSupplierReturnCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateSupplierReturnCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == command.SupplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {command.SupplierId} not found.");

        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        string branchCode = await debitNoteNumbers.ResolveBranchCodeAsync(branchId, cancellationToken).ConfigureAwait(false);
        decimal vatRate = command.ReverseInputVat
            ? (await mediator.Send(new GetPharmacySettingsQuery(), cancellationToken).ConfigureAwait(false)).VatRatePercent
            : 0m;

        var supplierReturn = SupplierReturn.Create(supplier.Id, command.ReturnDateUtc, command.Notes, branchId);

        foreach (var input in command.Items)
        {
            await EnsureWithinReceivedAsync(supplier.Id, input, cancellationToken).ConfigureAwait(false);

            var medicine = await mediator.Send(new GetMedicineByIdQuery(input.MedicineId), cancellationToken).ConfigureAwait(false);
            string medicineName = string.Join(' ', new[] { medicine.Name, medicine.Strength }.Where(s => !string.IsNullOrWhiteSpace(s)));
            decimal lineVat = medicine.IsTaxable && vatRate > 0
                ? Math.Round(input.Quantity * input.UnitCost * vatRate / 100m, 2, MidpointRounding.AwayFromZero)
                : 0m;

            supplierReturn.AddItem(input.MedicineId, input.Quantity, input.UnitCost, input.ReturnReason, input.Notes, medicineName, lineVat);
        }

        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = dbContext.Database.IsRelational()
                ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken).ConfigureAwait(false)
                : null;

            var deductions = await stockDeductionService.DeductForSupplierReturnAsync(
                new StockDeductionRequest(
                    ReferenceType: "SupplierReturn",
                    ReferenceId: supplierReturn.Id,
                    Lines: command.Items.Select(i => new StockDeductionLine(i.MedicineId, i.Quantity, i.BatchId)).ToList()),
                cancellationToken).ConfigureAwait(false);

            // Record the lot each line came out of (the first one, when FEFO spread a line over several).
            for (int i = 0; i < supplierReturn.Items.Count && i < deductions.Count; i++)
            {
                var lot = deductions[i].Batches.Count > 0 ? deductions[i].Batches[0] : null;
                if (lot is not null)
                {
                    supplierReturn.Items[i].RecordBatch(lot.BatchId, lot.BatchNo);
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
                    TenantId: currentUser.GetTenant(),
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

    private async Task EnsureWithinReceivedAsync(Guid supplierId, SupplierReturnItemInput input, CancellationToken cancellationToken)
    {
        decimal received = await mediator.Send(
            new GetSupplierReceivedQuantityQuery(supplierId, input.MedicineId), cancellationToken)
            .ConfigureAwait(false);
        if (received <= 0)
        {
            return;
        }

        decimal alreadyReturned = await (
            from item in dbContext.SupplierReturnItems
            join ret in dbContext.SupplierReturns on item.SupplierReturnId equals ret.Id
            where ret.SupplierId == supplierId && item.MedicineId == input.MedicineId
            select item.Quantity)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal eligible = received - alreadyReturned;
        if (input.Quantity > eligible)
        {
            throw new CustomException(
                string.Create(
                    CultureInfo.InvariantCulture,
                    $"Only {Math.Max(0, eligible)} can go back to this supplier (received {received}, already returned {alreadyReturned})."),
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
