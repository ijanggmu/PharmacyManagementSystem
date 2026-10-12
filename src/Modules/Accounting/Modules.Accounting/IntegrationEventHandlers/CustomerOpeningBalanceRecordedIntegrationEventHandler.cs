using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Customers.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the GL side of a new customer's opening balance so the Accounts Receivable control account
/// matches the customer subledger: a receivable (positive amount) is Dr Accounts Receivable / Cr Owner's
/// Equity; a customer advance (negative amount) is Dr Owner's Equity / Cr Accounts Receivable — the same
/// equity plug the onboarding migration uses for opening party balances. The onboarding wizard posts its
/// customer balances to the GL without creating customers, so it never raises this event (no double post).
/// Dated at the ledger entry and stamped with the customer's branch (null → the tenant's default branch).
/// Idempotent via the posted-voucher unique index on (TenantId, ReferenceType, ReferenceId).</summary>
public sealed class CustomerOpeningBalanceRecordedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<CustomerOpeningBalanceRecordedIntegrationEvent>
{
    public const string ReferenceType = "CustomerOpeningBalance";

    public async Task HandleAsync(CustomerOpeningBalanceRecordedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.Amount == 0m)
        {
            return;
        }

        decimal amount = Math.Abs(@event.Amount);
        bool receivable = @event.Amount > 0m;

        var accountsReceivableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable, ct).ConfigureAwait(false);
        var equityId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, ct).ConfigureAwait(false);

        IReadOnlyList<PostVoucherLine> lines = receivable
            ?
            [
                new PostVoucherLine(accountsReceivableId, "Customer opening balance", DebitAmount: amount, CreditAmount: 0m),
                new PostVoucherLine(equityId, "Opening balance", DebitAmount: 0m, CreditAmount: amount),
            ]
            :
            [
                new PostVoucherLine(equityId, "Opening balance", DebitAmount: amount, CreditAmount: 0m),
                new PostVoucherLine(accountsReceivableId, "Customer opening advance", DebitAmount: 0m, CreditAmount: amount),
            ];

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_opening_balance",
                ReferenceType: ReferenceType,
                ReferenceId: @event.LedgerEntryId,
                Narration: $"Opening balance of customer '{@event.CustomerName}'",
                Lines: lines,
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.OccurredOnUtc),
            ct).ConfigureAwait(false);
    }
}
