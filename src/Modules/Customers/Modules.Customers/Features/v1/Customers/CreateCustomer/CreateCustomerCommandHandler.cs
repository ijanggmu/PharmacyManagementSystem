using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using Mediator;

namespace FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;

public sealed class CreateCustomerCommandHandler(CustomersDbContext dbContext, ICustomerCodeService customerCodes)
    : ICommandHandler<CreateCustomerCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateCustomerCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string code = await customerCodes.NextAsync(cancellationToken).ConfigureAwait(false);
        var customer = Customer.Create(
            command.Name, command.Phone, command.Email, command.Address, command.OpeningBalance, code, command.CreditLimit);
        if (command.Allergies is not null)
        {
            customer.SetAllergies(command.Allergies);
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
