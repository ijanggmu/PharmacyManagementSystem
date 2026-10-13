using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;

/// <summary>
/// Creates a customer. An opening balance is money on account, so it needs the credit permission (same as a
/// credit limit), is written to the AR subledger as an <see cref="CustomerLedgerEntryType.OpeningBalance"/>
/// entry, and raises <see cref="CustomerOpeningBalanceRecordedIntegrationEvent"/> through the outbox in the
/// same transaction, so Accounting posts the matching GL voucher (Dr AR / Cr Owner's Equity, or the reverse
/// for a customer advance) and the AR control account keeps agreeing with the subledger.
/// </summary>
public sealed class CreateCustomerCommandHandler(
    CustomersDbContext dbContext,
    ICustomerCodeService customerCodes,
    ICustomerCreditPermissionGuard creditPermission,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch)
    : ICommandHandler<CreateCustomerCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateCustomerCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (command.CreditLimit is not null || command.CreditDays is not null)
        {
            await creditPermission.EnsureCanManageCreditAsync(cancellationToken).ConfigureAwait(false);
        }

        Guid? branchId = null;
        if (command.OpeningBalance != 0m)
        {
            await creditPermission.EnsureCanSetOpeningBalanceAsync(cancellationToken).ConfigureAwait(false);
            branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        }

        // One transaction: the customer, its opening-balance ledger entry and the outbox row commit together.
        return await CustomerWrites.ExecuteAsync(
            dbContext,
            ct => CreateAsync(command, branchId, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> CreateAsync(CreateCustomerCommand command, Guid? branchId, CancellationToken cancellationToken)
    {
        string code = await customerCodes.NextAsync(cancellationToken).ConfigureAwait(false);
        var customer = Customer.Create(
            command.Name, command.Phone, command.Email, command.Address, command.OpeningBalance, code, command.CreditLimit);
        if (command.IsMember)
        {
            customer.SetMembership(true);
        }

        if (command.CreditDays is not null)
        {
            customer.SetCreditDays(command.CreditDays);
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

        CustomerLedgerEntry? entry = null;
        if (command.OpeningBalance != 0m)
        {
            entry = CustomerLedgerEntry.Create(
                customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.OpeningBalance,
                "Opening balance", debitAmount: command.OpeningBalance > 0 ? command.OpeningBalance : 0m,
                creditAmount: command.OpeningBalance < 0 ? -command.OpeningBalance : 0m,
                runningBalance: customer.CurrentBalance, branchId: branchId);
            dbContext.CustomerLedgerEntries.Add(entry);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (entry is not null)
        {
            await outbox.AddAsync(new CustomerOpeningBalanceRecordedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: entry.EntryDateUtc,
                TenantId: currentUser.GetTenant(),
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: "Customers",
                LedgerEntryId: entry.Id,
                CustomerId: customer.Id,
                CustomerName: customer.Name,
                Amount: command.OpeningBalance,
                BranchId: branchId),
                cancellationToken).ConfigureAwait(false);
        }

        return customer.Id;
    }
}
