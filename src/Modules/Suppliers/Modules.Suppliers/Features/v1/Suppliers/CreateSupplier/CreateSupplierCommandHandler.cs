using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Mediator;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.CreateSupplier;

/// <summary>
/// Creates a supplier. A non-zero opening balance needs the Manage Supplier Opening Balances permission, is
/// written as the supplier's first AP ledger entry, and raises <see cref="SupplierOpeningBalanceRecordedIntegrationEvent"/>
/// in the same transaction, so Accounting posts the matching GL voucher (AP vs opening-balance equity) and the
/// AP control account keeps agreeing with the subledger.
/// </summary>
public sealed class CreateSupplierCommandHandler(
    SuppliersDbContext dbContext,
    ICurrentBranch currentBranch,
    ISupplierLedgerPermissionGuard ledgerPermissions,
    IOutboxWriter outbox,
    ICurrentUser currentUser)
    : ICommandHandler<CreateSupplierCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateSupplierCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (command.OpeningBalance != 0m)
        {
            await ledgerPermissions.EnsureCanManageOpeningBalanceAsync(cancellationToken).ConfigureAwait(false);
        }

        await SupplierNameGuard.EnsureAvailableAsync(dbContext, command.Name, excludeId: null, cancellationToken)
            .ConfigureAwait(false);

        Guid? branchId = command.OpeningBalance != 0m
            ? await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false)
            : null;

        return await SupplierRowLock.InTransactionAsync(dbContext, async () =>
        {
            var supplier = Supplier.Create(
                command.Name, command.ContactPerson, command.Phone, command.Email,
                command.Address, command.TaxId, command.OpeningBalance);

            dbContext.Suppliers.Add(supplier);

            SupplierLedgerEntry? entry = null;
            if (command.OpeningBalance != 0m)
            {
                entry = SupplierLedgerEntry.Create(
                    supplier.Id, DateTime.UtcNow, SupplierLedgerEntryType.OpeningBalance,
                    "Opening balance", debitAmount: command.OpeningBalance > 0 ? command.OpeningBalance : 0m,
                    creditAmount: command.OpeningBalance < 0 ? -command.OpeningBalance : 0m,
                    runningBalance: supplier.CurrentBalance,
                    referenceType: null, referenceId: null, branchId: branchId);
                dbContext.SupplierLedgerEntries.Add(entry);
            }

            await SupplierNameGuard.SaveChangesAsync(dbContext, command.Name, cancellationToken).ConfigureAwait(false);

            if (entry is not null)
            {
                await outbox.AddAsync(new SupplierOpeningBalanceRecordedIntegrationEvent(
                    Id: Guid.NewGuid(),
                    OccurredOnUtc: DateTime.UtcNow,
                    TenantId: currentUser.GetTenant(),
                    CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                    Source: "Suppliers",
                    LedgerEntryId: entry.Id,
                    SupplierId: supplier.Id,
                    SupplierName: supplier.Name,
                    Amount: command.OpeningBalance,
                    VoucherDateUtc: entry.EntryDateUtc,
                    BranchId: branchId),
                    cancellationToken).ConfigureAwait(false);
            }

            return supplier.Id;
        }, cancellationToken).ConfigureAwait(false);
    }
}
