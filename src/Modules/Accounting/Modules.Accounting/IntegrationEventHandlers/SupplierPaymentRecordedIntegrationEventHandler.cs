using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Suppliers.Contracts.Events;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the voucher for a supplier payment: Dr Accounts Payable (settled) / Cr Cash or Bank
/// (paid out, per the event's payment method — see <see cref="IPaymentMethodAccountResolver"/>). Idempotent via the posted-voucher unique index on (TenantId, ReferenceType,
/// ReferenceId).
/// <para>With TDS withheld (<see cref="SupplierPaymentRecordedIntegrationEvent.TdsAmount"/> &gt; 0): Dr AP the gross
/// settled / Cr the money account the net paid out / Cr TDS Payable the TDS, and a <see cref="TdsDeduction"/> row
/// for the TDS report, saved with the voucher. A TDS amount that is not less than the payment is ignored (the event
/// can't be refused at this point; Suppliers validates it).</para></summary>
public sealed class SupplierPaymentRecordedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts,
    AccountingDbContext dbContext)
    : IIntegrationEventHandler<SupplierPaymentRecordedIntegrationEvent>
{
    public const string ReferenceType = "SupplierPayment";

    public async Task HandleAsync(SupplierPaymentRecordedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var accountsPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, ct).ConfigureAwait(false);
        bool cash = PaymentMethodAccounts.IsCash(@event.PaymentMethod);
        var moneyAccountId = await paymentAccounts.ResolveAccountIdAsync(@event.PaymentMethod, ct).ConfigureAwait(false);
        DateTime paymentDateUtc = @event.PaymentDateUtc ?? @event.OccurredOnUtc;

        decimal tdsAmount = @event.TdsAmount > 0m && @event.TdsAmount < @event.Amount && !string.IsNullOrWhiteSpace(@event.TdsCategory)
            ? AccountingVoucher.RoundAmount(@event.TdsAmount)
            : 0m;

        var lines = new List<PostVoucherLine>(3)
        {
            new(accountsPayableId, "Accounts payable settled", DebitAmount: @event.Amount, CreditAmount: 0m),
            new(moneyAccountId, cash ? "Cash paid out" : "Paid from bank", DebitAmount: 0m, CreditAmount: @event.Amount - tdsAmount),
        };

        if (tdsAmount > 0m)
        {
            var tds = await BuildWithholdingAsync(@event, tdsAmount, ct).ConfigureAwait(false);
            var tdsAccountId = await TdsPayableAccount.GetOrCreateAsync(dbContext, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(
                tdsAccountId,
                string.Create(System.Globalization.CultureInfo.InvariantCulture, $"TDS withheld — {tds.CategoryName}"),
                DebitAmount: 0m, CreditAmount: tdsAmount));

            // Saved together with the voucher below (PostSystemVoucherAsync saves once). A redelivery finds the row.
            bool recorded = await dbContext.TdsDeductions
                .AnyAsync(d => d.SourceType == TdsDeduction.SourceTypes.SupplierPayment && d.SourceId == @event.LedgerEntryId, ct)
                .ConfigureAwait(false);
            if (!recorded)
            {
                dbContext.TdsDeductions.Add(TdsDeduction.Create(
                    TdsDeduction.SourceTypes.SupplierPayment, @event.LedgerEntryId, paymentDateUtc, @event.SupplierName,
                    @event.SupplierPan, tds, @event.DocumentReference ?? @event.Description, @event.BranchId));
            }
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_supplier_payment",
                ReferenceType: ReferenceType,
                ReferenceId: @event.LedgerEntryId,
                Narration: $"Payment to supplier '{@event.SupplierName}'" + (@event.Description is null ? "" : $" — {@event.Description}"),
                Lines: lines,
                BranchId: @event.BranchId,
                // The payment date the user recorded, not when the event was processed (older events
                // without it fall back to when they were raised).
                VoucherDateUtc: paymentDateUtc),
            ct).ConfigureAwait(false);
    }

    /// <summary>The withholding as recorded: the category's current name (its code when the tenant has no such
    /// category), the event's rate (else the category's, else the effective rate) and taxable amount (else the gross).</summary>
    private async Task<TdsWithholding> BuildWithholdingAsync(SupplierPaymentRecordedIntegrationEvent @event, decimal tdsAmount, CancellationToken ct)
    {
        string code = TdsCategory.NormalizeCode(@event.TdsCategory!);
        var category = (await TdsCategoryCatalog.ListAsync(dbContext, ct).ConfigureAwait(false)).Find(c => c.Code == code);
        decimal taxable = @event.TdsTaxableAmount is { } given && given >= tdsAmount && given > 0m ? given : @event.Amount;
        decimal rate = @event.TdsRatePercent
            ?? category?.RatePercent
            ?? Math.Round(tdsAmount * 100m / taxable, 2, MidpointRounding.AwayFromZero);
        return new TdsWithholding(code, category?.Name ?? code, rate, taxable, tdsAmount);
    }
}
