using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetCashMovement;

/// <summary>Cash + Bank accounts combined — both are debit-normal assets, so no split is needed to
/// answer "how much moved through the drawer/bank".</summary>
public sealed class GetCashMovementQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetCashMovementQuery, CashMovementDto>
{
    public async ValueTask<CashMovementDto> Handle(GetCashMovementQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var cashAccountIds = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == AccountingSystemAccountCodes.Cash || a.Code == AccountingSystemAccountCodes.Bank)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

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
            select new { line.DebitAmount, line.CreditAmount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal totalInflow = inPeriod.Sum(l => l.DebitAmount);
        decimal totalOutflow = inPeriod.Sum(l => l.CreditAmount);

        return new CashMovementDto(query.FromUtc, query.ToUtc, openingBalance, totalInflow, totalOutflow, openingBalance + totalInflow - totalOutflow);
    }
}
