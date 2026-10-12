using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Mediator;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.CreateSupplier;

public sealed class CreateSupplierCommandHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<CreateSupplierCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateSupplierCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await SupplierNameGuard.EnsureAvailableAsync(dbContext, command.Name, excludeId: null, cancellationToken)
            .ConfigureAwait(false);

        var supplier = Supplier.Create(
            command.Name, command.ContactPerson, command.Phone, command.Email,
            command.Address, command.TaxId, command.OpeningBalance);

        dbContext.Suppliers.Add(supplier);

        if (command.OpeningBalance != 0m)
        {
            Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

            var entry = SupplierLedgerEntry.Create(
                supplier.Id, DateTime.UtcNow, SupplierLedgerEntryType.OpeningBalance,
                "Opening balance", debitAmount: command.OpeningBalance > 0 ? command.OpeningBalance : 0m,
                creditAmount: command.OpeningBalance < 0 ? -command.OpeningBalance : 0m,
                runningBalance: supplier.CurrentBalance,
                referenceType: null, referenceId: null, branchId: branchId);
            dbContext.SupplierLedgerEntries.Add(entry);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return supplier.Id;
    }
}
