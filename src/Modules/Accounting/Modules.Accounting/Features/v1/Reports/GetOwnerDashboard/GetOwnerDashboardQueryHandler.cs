using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetOwnerDashboard;

/// <summary>
/// Composes the owner dashboard in one request: sales and stock figures come from the Sales and Inventory
/// modules through their Contracts queries, balances and the month's margin straight from this module's
/// ledger (posted vouchers, the same rule as the trial balance). The result is cached for a minute per tenant,
/// branch scope and month (<see cref="OwnerDashboardCache"/>) — the home page is opened many times a day
/// and the figures need not be to-the-second.
/// </summary>
public sealed class GetOwnerDashboardQueryHandler(
    AccountingDbContext dbContext,
    IMediator mediator,
    ICurrentBranch currentBranch,
    HybridCache cache,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
    TimeProvider timeProvider)
    : IQueryHandler<GetOwnerDashboardQuery, OwnerDashboardDto>
{
    private const int TopMedicineCount = 5;

    public async ValueTask<OwnerDashboardDto> Handle(GetOwnerDashboardQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Resolve the caller's branch scope BEFORE the cache, so a pinned user can never be served another
        // branch's cached figures: the scope is part of the key.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        DateOnly today = NepalDate.FromUtc(now);
        DateTime todayStartUtc = NepalDate.StartUtc(today);
        DateTime monthStartUtc = query.MonthStartUtc ?? NepalDate.StartUtc(new DateOnly(today.Year, today.Month, 1));
        string tenantId = tenantAccessor.MultiTenantContext?.TenantInfo?.Id ?? "none";

        string key = OwnerDashboardCache.Key(tenantId, branchId, monthStartUtc, today);

        // Never build inside a HybridCache factory: HybridCache runs it via ThreadPool.UnsafeQueueUserWorkItem,
        // which drops the ExecutionContext — the tenant (Finbuckle AsyncLocal), current user and branch are gone
        // and the first tenant-filtered query throws. Read-only lookup first, then build on the request's own flow.
        var cached = await cache.GetOrCreateAsync<OwnerDashboardDto?>(
                key,
                static _ => ValueTask.FromResult<OwnerDashboardDto?>(null),
                OwnerDashboardCache.ReadOnlyOptions,
                cancellationToken: cancellationToken)
            .ConfigureAwait(false);
        if (cached is not null)
        {
            return cached;
        }

        var dashboard = await BuildAsync(branchId, now, todayStartUtc, monthStartUtc, cancellationToken).ConfigureAwait(false);
        await cache.SetAsync(key, dashboard, OwnerDashboardCache.EntryOptions, [OwnerDashboardCache.Tag(tenantId)], cancellationToken)
            .ConfigureAwait(false);
        return dashboard;
    }

    private async Task<OwnerDashboardDto> BuildAsync(
        Guid? branchId, DateTime now, DateTime todayStartUtc, DateTime monthStartUtc, CancellationToken ct)
    {
        // Sequential on purpose: every module DbContext in this scope shares one connection.
        var todaySales = await mediator.Send(new GetSalesStatsQuery(todayStartUtc, now, branchId), ct).ConfigureAwait(false);
        var monthSales = await mediator.Send(new GetSalesStatsQuery(monthStartUtc, now, branchId), ct).ConfigureAwait(false);
        decimal stockValue = await mediator.Send(new GetStockValuationQuery(branchId), ct).ConfigureAwait(false);
        var margins = await mediator.Send(new GetMedicineMarginsQuery(monthStartUtc, now, TopMedicineCount, branchId), ct)
            .ConfigureAwait(false);
        var names = margins.Count == 0
            ? new Dictionary<Guid, string>()
            : await mediator.Send(new GetMedicineNamesQuery(margins.Select(m => m.MedicineId).ToList()), ct).ConfigureAwait(false);

        var ledger = await LoadLedgerFiguresAsync(branchId, now, monthStartUtc, ct).ConfigureAwait(false);

        return new OwnerDashboardDto(
            GeneratedAtUtc: now,
            BranchId: branchId,
            TodayStartUtc: todayStartUtc,
            MonthStartUtc: monthStartUtc,
            TodaySales: todaySales.TotalRevenue,
            TodaySaleCount: todaySales.SaleCount,
            MonthSales: monthSales.TotalRevenue,
            MonthSaleCount: monthSales.SaleCount,
            MonthNetSales: ledger.NetSales,
            MonthCostOfGoodsSold: ledger.CostOfGoodsSold,
            MonthGrossProfit: ledger.NetSales - ledger.CostOfGoodsSold,
            GrossMarginPercent: OwnerDashboardMath.GrossMarginPercent(ledger.NetSales, ledger.CostOfGoodsSold),
            StockValue: stockValue,
            Receivables: ledger.Receivables,
            Payables: ledger.Payables,
            CashAndBankBalance: ledger.MoneyAccounts.Sum(a => a.Balance),
            CashAndBankAccounts: ledger.MoneyAccounts,
            VatPayable: ledger.VatPayable,
            TopMedicinesByMargin: margins
                .Select(m => new OwnerDashboardTopMedicineDto(
                    m.MedicineId,
                    names.GetValueOrDefault(m.MedicineId, "(unknown medicine)"),
                    m.Quantity, m.NetRevenue, m.Cost, m.Margin, m.MarginPercent))
                .ToList());
    }

    private async Task<OwnerDashboardMath.LedgerFigures> LoadLedgerFiguresAsync(
        Guid? branchId, DateTime now, DateTime monthStartUtc, CancellationToken ct)
    {
        string[] controlCodes =
        [
            AccountingSystemAccountCodes.AccountsReceivable,
            AccountingSystemAccountCodes.AccountsPayable,
            AccountingSystemAccountCodes.VatPayable,
            AccountingSystemAccountCodes.InputVatRecoverable,
            AccountingSystemAccountCodes.SalesRevenue,
            AccountingSystemAccountCodes.SalesReturnsAndAllowances,
            AccountingSystemAccountCodes.CostOfGoodsSold,
        ];

        var accounts = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => controlCodes.Contains(a.Code)
                || (a.AccountType == AccountingAccountType.Asset && a.Code.StartsWith(CashBankAccounts.CodePrefix)))
            .Select(a => new { a.Id, a.Code, a.Name, a.AccountType, a.IsActive })
            .ToListAsync(ct)
            .ConfigureAwait(false);
        var accountIds = accounts.Select(a => a.Id).ToList();

        // Balances as of now (every posted voucher up to now, closing entries included — like the trial balance).
        var balances = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where voucher.VoucherDateUtc <= now
                && (branchId == null || voucher.BranchId == branchId)
                && accountIds.Contains(line.AccountId)
            group line by line.AccountId into g
            select new { AccountId = g.Key, Net = g.Sum(l => l.DebitAmount - l.CreditAmount) })
            .ToDictionaryAsync(x => x.AccountId, x => x.Net, ct)
            .ConfigureAwait(false);

        // The month's movement on the P&L accounts; year-end closing entries are left out as in the P&L report.
        var monthMovement = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers().ExcludingYearEndClose(dbContext) on line.VoucherId equals voucher.Id
            where voucher.VoucherDateUtc >= monthStartUtc
                && voucher.VoucherDateUtc <= now
                && (branchId == null || voucher.BranchId == branchId)
                && accountIds.Contains(line.AccountId)
            group line by line.AccountId into g
            select new { AccountId = g.Key, Net = g.Sum(l => l.DebitAmount - l.CreditAmount) })
            .ToDictionaryAsync(x => x.AccountId, x => x.Net, ct)
            .ConfigureAwait(false);

        decimal NetByCode(IReadOnlyDictionary<Guid, decimal> nets, string code) =>
            accounts.Where(a => a.Code == code).Sum(a => nets.GetValueOrDefault(a.Id));

        var moneyAccounts = accounts
            .Where(a => a.AccountType == AccountingAccountType.Asset && a.Code.StartsWith(CashBankAccounts.CodePrefix, StringComparison.Ordinal))
            .Select(a => new OwnerDashboardMoneyAccountDto(a.Id, a.Code, a.Name, balances.GetValueOrDefault(a.Id)))
            // Keep inactive accounts only while they still hold money, so nothing silently drops out of the total.
            .Where(a => a.Balance != 0m || accounts.First(x => x.Id == a.AccountId).IsActive)
            .OrderBy(a => a.Code, StringComparer.Ordinal)
            .ToList();

        return OwnerDashboardMath.FromNets(
            receivablesNet: NetByCode(balances, AccountingSystemAccountCodes.AccountsReceivable),
            payablesNet: NetByCode(balances, AccountingSystemAccountCodes.AccountsPayable),
            outputVatNet: NetByCode(balances, AccountingSystemAccountCodes.VatPayable),
            inputVatNet: NetByCode(balances, AccountingSystemAccountCodes.InputVatRecoverable),
            salesRevenueMonthNet: NetByCode(monthMovement, AccountingSystemAccountCodes.SalesRevenue),
            salesReturnsMonthNet: NetByCode(monthMovement, AccountingSystemAccountCodes.SalesReturnsAndAllowances),
            cogsMonthNet: NetByCode(monthMovement, AccountingSystemAccountCodes.CostOfGoodsSold),
            moneyAccounts: moneyAccounts);
    }
}
