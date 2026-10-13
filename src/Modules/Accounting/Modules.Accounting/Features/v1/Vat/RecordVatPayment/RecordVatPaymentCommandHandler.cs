using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Vat;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Vat.RecordVatPayment;

/// <summary>Posts a VAT payment to IRD: Dr VAT Payable / Cr the money account the tenant maps the payment method to (Cash or Bank by default), dated at the payment date. A date
/// in a locked period is refused (the user picked it, unlike a system event's date).</summary>
public sealed class RecordVatPaymentCommandHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts,
    ICurrentBranch currentBranch,
    AccountingPostingLockService postingLockService) : ICommandHandler<RecordVatPaymentCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordVatPaymentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await postingLockService.AssertPostingOpenAsync(command.PaymentDateUtc, cancellationToken).ConfigureAwait(false);

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var vatPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.VatPayable, cancellationToken).ConfigureAwait(false);
        bool cash = PaymentMethodAccounts.IsCash(command.PaymentMethod);
        var moneyAccountId = await paymentAccounts
            .ResolveAccountIdAsync(command.PaymentMethod, cancellationToken)
            .ConfigureAwait(false);

        string reference = string.IsNullOrWhiteSpace(command.Reference) ? string.Empty : $" (ref {command.Reference.Trim()})";
        string narration = string.IsNullOrWhiteSpace(command.Narration)
            ? $"VAT paid to IRD{reference}"
            : $"{command.Narration.Trim()}{reference}";

        // A single voucher write — PostSystemVoucherAsync saves once, so no extra transaction is needed.
        return await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: VatSettlement.VoucherType,
                ReferenceType: VatSettlement.ReferenceType,
                ReferenceId: Guid.CreateVersion7(),
                Narration: narration,
                Lines:
                [
                    new PostVoucherLine(vatPayableId, "VAT payable settled", DebitAmount: command.Amount, CreditAmount: 0m),
                    new PostVoucherLine(moneyAccountId, cash ? "Paid in cash" : "Paid from bank", DebitAmount: 0m, CreditAmount: command.Amount),
                ],
                BranchId: branchId,
                VoucherDateUtc: command.PaymentDateUtc),
            cancellationToken).ConfigureAwait(false);
    }
}
