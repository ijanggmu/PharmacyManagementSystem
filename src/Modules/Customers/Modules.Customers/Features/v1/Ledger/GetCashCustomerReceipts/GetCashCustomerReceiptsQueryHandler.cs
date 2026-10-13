using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetCashCustomerReceipts;

public sealed class GetCashCustomerReceiptsQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCashCustomerReceiptsQuery, decimal>
{
    public async ValueTask<decimal> Handle(GetCashCustomerReceiptsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Cash payments taken, less cash payments voided, in the window: a void carries the payment's method
        // and branch, so it takes the cash back out of the drawer it is recorded in (as the GL reversal does).
        return await dbContext.CustomerLedgerEntries.AsNoTracking()
            .Where(e => (e.EntryType == CustomerLedgerEntryType.Payment
                    || e.ReferenceType == CustomerLedgerEntry.PaymentVoidReference)
                && e.PaymentMethod == CustomerLedgerEntry.CashPaymentMethod
                && e.BranchId == query.BranchId
                && e.CreatedAtUtc >= query.FromUtc
                && e.CreatedAtUtc <= query.ToUtc)
            .SumAsync(e => e.CreditAmount - e.DebitAmount, cancellationToken)
            .ConfigureAwait(false);
    }
}
