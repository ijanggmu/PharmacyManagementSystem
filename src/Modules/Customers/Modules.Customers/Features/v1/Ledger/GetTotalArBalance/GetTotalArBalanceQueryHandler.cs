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
            return await dbContext.Customers.AsNoTracking().SumAsync(c => c.CurrentBalance, cancellationToken).ConfigureAwait(false);
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
