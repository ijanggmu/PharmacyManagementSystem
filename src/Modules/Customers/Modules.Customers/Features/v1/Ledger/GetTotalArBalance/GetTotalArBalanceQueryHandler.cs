using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetTotalArBalance;

public sealed class GetTotalArBalanceQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetTotalArBalanceQuery, decimal>
{
    public async ValueTask<decimal> Handle(GetTotalArBalanceQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        if (query.BranchId is not { } branchId)
        {
            // Trashed customers are included: deleting one with a balance is refused, but rows trashed
            // before that guard (or by a direct data fix) still owe money, and the per-branch figure below
            // (straight from the ledger) counts them too.
            return await dbContext.Customers
                .AsNoTracking()
                .IgnoreQueryFilters([QueryFilters.SoftDelete])
                .SumAsync(c => c.CurrentBalance, cancellationToken)
                .ConfigureAwait(false);
        }

        // CurrentBalance is tenant-wide, so a per-branch total comes from that branch's ledger rows.
        // Rows with a null BranchId (legacy/tenant-wide) belong to no branch and are left out.
        return await dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .Where(e => e.BranchId == branchId)
            .SumAsync(e => e.DebitAmount - e.CreditAmount, cancellationToken)
            .ConfigureAwait(false);
    }
}
