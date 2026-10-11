using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using Mediator;

namespace FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;

public sealed class CreateCustomerCommandHandler(
    CustomersDbContext dbContext,
    ICustomerCodeService customerCodes,
    ICustomerCreditPermissionGuard creditPermission)
    : ICommandHandler<CreateCustomerCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateCustomerCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (command.CreditLimit is not null)
        {
            await creditPermission.EnsureCanManageCreditAsync(cancellationToken).ConfigureAwait(false);
        }

        string code = await customerCodes.NextAsync(cancellationToken).ConfigureAwait(false);
        var customer = Customer.Create(
            command.Name, command.Phone, command.Email, command.Address, command.OpeningBalance, code, command.CreditLimit);
        if (command.IsMember)
        {
            customer.SetMembership(true);
        }

        if (command.Allergies is not null)
        {
            customer.SetAllergies(command.Allergies);
        }

        if (command.ChronicConditions is not null)
        {
            customer.SetChronicConditions(command.ChronicConditions);
        }

        if (command.CurrentMedications is not null)
        {
            customer.SetCurrentMedications(command.CurrentMedications);
        }

        dbContext.Customers.Add(customer);

        if (command.OpeningBalance != 0m)
        {
            var entry = CustomerLedgerEntry.Create(
                customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.OpeningBalance,
                "Opening balance", debitAmount: command.OpeningBalance > 0 ? command.OpeningBalance : 0m,
                creditAmount: command.OpeningBalance < 0 ? -command.OpeningBalance : 0m,
                runningBalance: customer.CurrentBalance);
            dbContext.CustomerLedgerEntries.Add(entry);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return customer.Id;
    }
}
