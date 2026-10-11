using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetCashMovement;

/// <summary>
/// Every cash and bank account combined (<see cref="CashBankAccounts"/>) — all debit-normal assets, so no
/// split is needed to answer "how much money came in and went out". Movement is netted per voucher: a
/// voucher that only shifts money between the tenant's own cash and bank accounts (Dr Bank / Cr Cash)
/// nets to zero and counts as neither inflow nor outflow — summing raw debits and credits counted every
/// deposit twice, once in and once out.
/// </summary>
public sealed class GetCashMovementQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetCashMovementQuery, CashMovementDto>
{
    public async ValueTask<CashMovementDto> Handle(GetCashMovementQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var cashAccountIds = await CashBankAccounts.IdsAsync(dbContext, cancellationToken).ConfigureAwait(false);

        var opening = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where cashAccountIds.Contains(line.AccountId)
                && voucher.VoucherDateUtc < query.FromUtc
                && (branchFilter == null || voucher.BranchId == branchFilter)
            select new { line.DebitAmount, line.CreditAmount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        decimal openingBalance = opening.Sum(l => l.DebitAmount) - opening.Sum(l => l.CreditAmount);

        var inPeriod = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where cashAccountIds.Contains(line.AccountId)
                && voucher.VoucherDateUtc >= query.FromUtc
                && voucher.VoucherDateUtc <= query.ToUtc
                && (branchFilter == null || voucher.BranchId == branchFilter)
            select new { line.VoucherId, line.DebitAmount, line.CreditAmount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal totalInflow = 0m, totalOutflow = 0m, internalTransfers = 0m;
        foreach (var voucher in inPeriod.GroupBy(l => l.VoucherId))
        {
            decimal debits = voucher.Sum(l => l.DebitAmount);
            decimal credits = voucher.Sum(l => l.CreditAmount);
            decimal net = debits - credits;
            if (net > 0m)
            {
                totalInflow += net;
            }
            else
            {
                totalOutflow -= net;
            }

            internalTransfers += Math.Min(debits, credits);
        }

        return new CashMovementDto(
            query.FromUtc, query.ToUtc, openingBalance, totalInflow, totalOutflow,
            openingBalance + totalInflow - totalOutflow, internalTransfers);
    }
}
