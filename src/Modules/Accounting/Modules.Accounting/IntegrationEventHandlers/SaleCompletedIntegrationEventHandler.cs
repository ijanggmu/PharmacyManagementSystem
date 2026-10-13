using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Posts the GL voucher for a completed sale: Dr payment account (for the amount actually paid; an
/// insurance tender is money still to come from the insurer, so it goes to Insurance Receivable) and,
/// for a credit sale, Dr Accounts Receivable for the balance due / Cr Sales Revenue (net of discount
/// and, when the tenant has a VAT rate configured, net of VAT — the VAT portion posts to a separate
/// VAT Payable line instead), and — when the sale had a cost basis — Dr COGS / Cr Inventory at actual
/// FEFO cost. Idempotent via the posted-voucher unique index on (TenantId, ReferenceType,
/// ReferenceId), so a redelivered event is a safe no-op.
/// </summary>
public sealed class SaleCompletedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<SaleCompletedIntegrationEvent>
{
    private const string CashMethod = "cash";
    private const string CreditMethod = "credit";
    private const string InsuranceMethod = "insurance";

    public async Task HandleAsync(SaleCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var salesRevenueId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesRevenue, ct).ConfigureAwait(false);
        decimal netRevenue = @event.TotalAmount - @event.VatAmount;
        var lines = new List<PostVoucherLine>
        {
            new(salesRevenueId, "Sale revenue", DebitAmount: 0m, CreditAmount: netRevenue),
        };

        if (@event.VatAmount > 0)
        {
            var vatPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.VatPayable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(vatPayableId, "VAT collected on sale", DebitAmount: 0m, CreditAmount: @event.VatAmount));
        }

        if (@event.Payments is { } legs)
        {
            // Split tender: one debit per received leg. Credit legs are not cash in hand; they are carried
            // by BalanceDue below (Accounts Receivable).
            foreach (var leg in legs)
            {
                if (leg.Amount <= 0m || string.Equals(leg.Method, CreditMethod, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var legAccountId = await accountResolver.ResolveByCodeAsync(TenderAccountCode(leg.Method), ct).ConfigureAwait(false);
                lines.Add(new PostVoucherLine(legAccountId, $"Payment received ({leg.Method})", DebitAmount: leg.Amount, CreditAmount: 0m));
            }
        }
        else if (@event.PaymentAmount > 0)
        {
            // Legacy events (no per-tender data): single payment line from PaymentMethod/PaymentAmount.
            var paymentAccountId = await accountResolver.ResolveByCodeAsync(TenderAccountCode(@event.PaymentMethod), ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(paymentAccountId, "Payment received", DebitAmount: @event.PaymentAmount, CreditAmount: 0m));
        }

        if (@event.BalanceDue > 0)
        {
            var accountsReceivableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(accountsReceivableId, "Balance due on account", DebitAmount: @event.BalanceDue, CreditAmount: 0m));
        }

        if (@event.TotalCost > 0)
        {
            var cogsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.CostOfGoodsSold, ct).ConfigureAwait(false);
            var inventoryId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(cogsId, "Cost of goods sold", DebitAmount: @event.TotalCost, CreditAmount: 0m));
            lines.Add(new PostVoucherLine(inventoryId, "Inventory issued", DebitAmount: 0m, CreditAmount: @event.TotalCost));
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                "system_sale", "Sale", @event.SaleId,
                $"Sale {@event.SaleId}",
                lines, BranchId: @event.BranchId,
                // The sale completes when the event is raised, so OccurredOnUtc is the sale date.
                VoucherDateUtc: @event.OccurredOnUtc),
            ct).ConfigureAwait(false);
    }

    /// <summary>Cash → Cash; insurance → Insurance Receivable (the insurer pays later); anything else (card,
    /// bank, eSewa, Khalti, Fonepay, other) → Bank.</summary>
    private static string TenderAccountCode(string? method)
    {
        if (string.Equals(method, CashMethod, StringComparison.OrdinalIgnoreCase))
        {
            return AccountingSystemAccountCodes.Cash;
        }

        return string.Equals(method, InsuranceMethod, StringComparison.OrdinalIgnoreCase)
            ? AccountingSystemAccountCodes.InsuranceReceivable
            : AccountingSystemAccountCodes.Bank;
    }
}
