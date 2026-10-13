using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Sales.Contracts.Events;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Books a cash drawer's short/over when a shift closes with a count that differs from the expected cash, so
/// GL Cash follows the physical drawer: a shortage is Dr Cash Short &amp; Over / Cr Cash, an overage
/// Dr Cash / Cr Cash Short &amp; Over. Dated on the shift's close (a locked date moves to the open period in
/// <c>VoucherPostingService</c>), attributed to the shift's branch, and idempotent via the posted-voucher
/// unique index on (TenantId, ReferenceType, ReferenceId) with the shift id as the reference.
/// <para>The Cash Short &amp; Over account (<see cref="AccountingSystemAccountCodes.CashShortAndOver"/>) is
/// seeded by <c>AccountingDbInitializer</c>; a tenant whose seed has not run since it was added gets it
/// created here, under the Expenses head.</para>
/// </summary>
public sealed class CashShiftClosedWithVarianceIntegrationEventHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService)
    : IIntegrationEventHandler<CashShiftClosedWithVarianceIntegrationEvent>
{
    public const string VoucherType = "system_cash_shift_variance";
    public const string ReferenceType = "CashShift";

    public async Task HandleAsync(CashShiftClosedWithVarianceIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        decimal amount = AccountingVoucher.RoundAmount(Math.Abs(@event.Variance));
        if (amount == 0m)
        {
            return;
        }

        Guid cashId = await ResolveAccountIdAsync(AccountingSystemAccountCodes.Cash, ct).ConfigureAwait(false)
            ?? throw new InvalidOperationException($"No account with code '{AccountingSystemAccountCodes.Cash}' found.");
        Guid shortOverId = await ResolveAccountIdAsync(AccountingSystemAccountCodes.CashShortAndOver, ct).ConfigureAwait(false)
            ?? await CreateShortAndOverAccountAsync(ct).ConfigureAwait(false);

        bool isShort = @event.Variance < 0;
        PostVoucherLine[] lines = isShort
            ?
            [
                new(shortOverId, "Cash short at shift close", DebitAmount: amount, CreditAmount: 0m),
                new(cashId, "Drawer cash short", DebitAmount: 0m, CreditAmount: amount),
            ]
            :
            [
                new(cashId, "Drawer cash over", DebitAmount: amount, CreditAmount: 0m),
                new(shortOverId, "Cash over at shift close", DebitAmount: 0m, CreditAmount: amount),
            ];

        string narration = string.Create(
            System.Globalization.CultureInfo.InvariantCulture,
            $"Cash {(isShort ? "short" : "over")} at shift close: counted {@event.CountedCash:0.00}, expected {@event.ExpectedCash:0.00}");

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: VoucherType,
                ReferenceType: ReferenceType,
                ReferenceId: @event.CashShiftId,
                Narration: narration,
                Lines: lines,
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.ClosedAtUtc),
            ct).ConfigureAwait(false);
    }

    private async Task<Guid?> ResolveAccountIdAsync(string code, CancellationToken ct) =>
        await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == code)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(ct)
            .ConfigureAwait(false);

    /// <summary>Creates the system Cash Short &amp; Over account for a tenant seeded before it existed. Saved
    /// on its own before the voucher, since posting checks its accounts against the database; a concurrent
    /// creation fails on the unique code and the event is retried, finding the account then.</summary>
    private async Task<Guid> CreateShortAndOverAccountAsync(CancellationToken ct)
    {
        string expenseRootCode = AccountingAccount.RootHeads[AccountingAccountType.Expense].Code;
        Guid? expenseRoot = await dbContext.Accounts
            .Where(a => a.ParentId == null && a.IsSystem && a.Code == expenseRootCode)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(ct)
            .ConfigureAwait(false);

        var account = AccountingAccount.Create(
            AccountingSystemAccountCodes.CashShortAndOver, "Cash Short & Over", AccountingAccountType.Expense,
            isSystem: true, parentId: expenseRoot);
        dbContext.Accounts.Add(account);
        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
        return account.Id;
    }
}
