using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetPeriodTrialBalance;

/// <summary>
/// Opening / movement / closing per account in two queries: one to find the opening-balance vouchers dated
/// inside the period, one grouped aggregate over every ledger line up to the period end. Uses the same
/// ledger definition (<see cref="LedgerVoucherQueries.LedgerVouchers"/>) and branch rules as the as-of
/// trial balance, so the closing columns equal <c>GetTrialBalance(ToUtc)</c>.
/// </summary>
public sealed class GetPeriodTrialBalanceQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetPeriodTrialBalanceQuery, PeriodTrialBalanceDto>
{
    /// <summary>Voucher types that carry opening balances: the go-live opening voucher and the legacy
    /// migration-wizard vouchers.</summary>
    internal static readonly string[] OpeningVoucherTypes =
        [OpeningBalanceRules.VoucherType, OpeningBalanceService.LegacyMigrationVoucherType];

    public async ValueTask<PeriodTrialBalanceDto> Handle(GetPeriodTrialBalanceQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        DateTime periodFrom = query.FromUtc;
        DateTime periodTo = query.ToUtc;
        string[] openingTypes = OpeningVoucherTypes;

        var allVouchers = dbContext.Vouchers.AsNoTracking();
        var ledger = dbContext.LedgerVouchers()
            .Where(v => branchFilter == null || v.BranchId == branchFilter);

        // Opening-balance vouchers inside the period, plus reversals of them (an opening-balance reset
        // reverses the old opening voucher on its own date), so both sides of a reset move together.
        var openingInPeriod = await ledger
            .Where(v => v.VoucherDateUtc >= periodFrom && v.VoucherDateUtc <= periodTo)
            .Where(v => openingTypes.Contains(v.VoucherType)
                || (v.ReversesVoucherId != null
                    && allVouchers.Any(o => o.Id == v.ReversesVoucherId && openingTypes.Contains(o.VoucherType))))
            .OrderBy(v => v.VoucherDateUtc)
            .ThenBy(v => v.VoucherNo)
            .Select(v => new PeriodOpeningVoucherDto(v.Id, v.VoucherNo, v.VoucherDateUtc, v.VoucherType))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var openingIds = openingInPeriod.Select(v => v.VoucherId).ToList();

        var totals = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in ledger on line.VoucherId equals voucher.Id
            where voucher.VoucherDateUtc <= periodTo
            group new
            {
                line.DebitAmount,
                line.CreditAmount,
                Before = voucher.VoucherDateUtc < periodFrom,
                Opening = openingIds.Contains(voucher.Id),
            } by line.AccountId into g
            select new
            {
                AccountId = g.Key,
                OpeningDebit = g.Sum(x => x.Before ? x.DebitAmount : 0m),
                OpeningCredit = g.Sum(x => x.Before ? x.CreditAmount : 0m),
                PeriodDebit = g.Sum(x => x.Before ? 0m : x.DebitAmount),
                PeriodCredit = g.Sum(x => x.Before ? 0m : x.CreditAmount),
                OpeningVoucherDebit = g.Sum(x => x.Opening ? x.DebitAmount : 0m),
                OpeningVoucherCredit = g.Sum(x => x.Opening ? x.CreditAmount : 0m),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var accountIds = totals.Select(t => t.AccountId).ToList();
        var accounts = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => accountIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, cancellationToken)
            .ConfigureAwait(false);

        var lines = totals
            .Where(t => accounts.ContainsKey(t.AccountId))
            .Select(t =>
            {
                var account = accounts[t.AccountId];
                return new PeriodTrialBalanceLineDto(
                    account.Id, account.Code, account.Name, account.AccountType.ToString(),
                    t.OpeningDebit, t.OpeningCredit, t.PeriodDebit, t.PeriodCredit,
                    t.OpeningVoucherDebit, t.OpeningVoucherCredit);
            })
            .OrderBy(l => l.AccountCode, StringComparer.Ordinal)
            .ToList();

        return new PeriodTrialBalanceDto(periodFrom, periodTo, branchFilter, lines, openingInPeriod);
    }
}
