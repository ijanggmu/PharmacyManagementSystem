using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Suppliers.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Posts the GL side of a supplier opening balance entered on the supplier form, so the AP control account
/// agrees with the supplier subledger: a positive amount (owed to the supplier) is Cr Accounts Payable /
/// Dr Owners' Equity — the seeded chart has no separate "opening balance equity" account, the same choice the
/// Onboarding migration wizard makes — and a negative one (an advance) is the reverse. Dated at the ledger
/// entry, on its branch. Idempotent via the posted-voucher unique index on (TenantId, ReferenceType,
/// ReferenceId) keyed by the AP ledger entry id. The Onboarding wizard's supplier opening balances never raise
/// this event (it posts its own voucher), so the two paths can't double-post.
/// </summary>
public sealed class SupplierOpeningBalanceRecordedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<SupplierOpeningBalanceRecordedIntegrationEvent>
{
    public async Task HandleAsync(SupplierOpeningBalanceRecordedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.Amount == 0m)
        {
            return;
        }

        var accountsPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, ct).ConfigureAwait(false);
        var equityId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, ct).ConfigureAwait(false);

        decimal amount = Math.Abs(@event.Amount);
        bool payable = @event.Amount > 0m;

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_opening_balance",
                ReferenceType: "SupplierOpeningBalance",
                ReferenceId: @event.LedgerEntryId,
                Narration: $"Opening balance for supplier '{@event.SupplierName}'",
                Lines: payable
                    ?
                    [
                        new PostVoucherLine(equityId, "Opening balance equity", DebitAmount: amount, CreditAmount: 0m),
                        new PostVoucherLine(accountsPayableId, "Supplier opening balance payable", DebitAmount: 0m, CreditAmount: amount),
                    ]
                    :
                    [
                        new PostVoucherLine(accountsPayableId, "Supplier opening advance", DebitAmount: amount, CreditAmount: 0m),
                        new PostVoucherLine(equityId, "Opening balance equity", DebitAmount: 0m, CreditAmount: amount),
                    ],
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.VoucherDateUtc),
            ct).ConfigureAwait(false);
    }
}
