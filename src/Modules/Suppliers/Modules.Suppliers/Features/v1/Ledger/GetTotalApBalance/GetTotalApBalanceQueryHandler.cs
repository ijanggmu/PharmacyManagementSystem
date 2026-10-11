using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetTotalApBalance;

public sealed class GetTotalApBalanceQueryHandler(SuppliersDbContext dbContext)
    : IQueryHandler<GetTotalApBalanceQuery, decimal>
{
    public async ValueTask<decimal> Handle(GetTotalApBalanceQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        if (query.BranchId is not { } branchId)
        {
            return await dbContext.Suppliers.AsNoTracking().SumAsync(s => s.CurrentBalance, cancellationToken).ConfigureAwait(false);
        }

        // CurrentBalance is tenant-wide, so a per-branch total comes from that branch's ledger rows,
        // with the same sign as Supplier.ApplyLedgerEntry (debits less credits). Rows with a null
        // BranchId (legacy/tenant-wide) belong to no branch and are left out.
        return await dbContext.SupplierLedgerEntries
            .AsNoTracking()
            .Where(e => e.BranchId == branchId)
            .SumAsync(e => e.DebitAmount - e.CreditAmount, cancellationToken)
            .ConfigureAwait(false);
    }
}
