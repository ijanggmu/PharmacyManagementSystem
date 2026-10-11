using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetInventoryGlReconciliation;

public sealed class GetInventoryGlReconciliationQueryHandler(AccountingDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetInventoryGlReconciliationQuery, GlReconciliationDto>
{
    public async ValueTask<GlReconciliationDto> Handle(GetInventoryGlReconciliationQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same branch rule as the trial balance: users who may see every branch can pick one or all of
        // them, everyone else is pinned to their own branch. Both sides use the resolved branch.
        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var asOfUtc = DateTime.UtcNow;
        decimal subledgerTotal = await mediator.Send(new GetStockValuationQuery(branchFilter), cancellationToken).ConfigureAwait(false);

        var account = await dbContext.Accounts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Code == AccountingSystemAccountCodes.Inventory, cancellationToken)
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
            glBalance = totals.Sum(t => t.DebitAmount) - totals.Sum(t => t.CreditAmount); // Inventory is debit-normal
        }

        return new GlReconciliationDto("Inventory", asOfUtc, subledgerTotal, glBalance, subledgerTotal - glBalance, branchFilter);
    }
}
