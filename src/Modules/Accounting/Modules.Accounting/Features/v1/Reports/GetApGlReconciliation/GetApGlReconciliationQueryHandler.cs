using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetApGlReconciliation;

public sealed class GetApGlReconciliationQueryHandler(AccountingDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetApGlReconciliationQuery, GlReconciliationDto>
{
    public async ValueTask<GlReconciliationDto> Handle(GetApGlReconciliationQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same branch rule as the trial balance: users who may see every branch can pick one or all of
        // them, everyone else is pinned to their own branch. Both sides use the resolved branch.
        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var asOfUtc = DateTime.UtcNow;
        decimal subledgerTotal = await mediator.Send(new GetTotalApBalanceQuery(branchFilter), cancellationToken).ConfigureAwait(false);

        var account = await dbContext.Accounts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Code == AccountingSystemAccountCodes.AccountsPayable, cancellationToken)
            .ConfigureAwait(false);

        decimal glBalance = 0m;
        if (account is not null)
        {
            var totals = await (
                from line in dbContext.VoucherLines.AsNoTracking()
                join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
                where line.AccountId == account.Id && (branchFilter == null || voucher.BranchId == branchFilter)
                select new { line.DebitAmount, line.CreditAmount })
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);
            glBalance = totals.Sum(t => t.CreditAmount) - totals.Sum(t => t.DebitAmount); // AP is credit-normal
        }

        return new GlReconciliationDto("Accounts Payable", asOfUtc, subledgerTotal, glBalance, subledgerTotal - glBalance, branchFilter);
    }
}
