using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Vat;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Vat.RecordVatPayment;

/// <summary>Posts a VAT payment to IRD: Dr VAT Payable / Cr the money account the tenant maps the payment method to
/// (Cash or Bank by default), dated at the payment date. A date in a locked period is refused (the user picked it,
/// unlike a system event's date). The amount may not exceed the VAT payable as of the payment date (see
/// <see cref="VatPosition"/>); a partial payment is fine.</summary>
public sealed class RecordVatPaymentCommandHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts,
    ICurrentBranch currentBranch,
    AccountingPostingLockService postingLockService,
    AccountingDbContext dbContext) : ICommandHandler<RecordVatPaymentCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordVatPaymentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await postingLockService.AssertPostingOpenAsync(command.PaymentDateUtc, cancellationToken).ConfigureAwait(false);
        await AssertNotMoreThanPayableAsync(command, cancellationToken).ConfigureAwait(false);

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

    /// <summary>
    /// Refuses a payment larger than the VAT payable as of the end of the payment's Nepal day: the tenant-wide
    /// ledger VAT position (output VAT − input VAT − earlier payments + refunds received; see
    /// <see cref="VatPosition"/>). Tenant-wide because VAT is registered and filed per PAN, not per branch, while
    /// the payment voucher is booked under the paying user's branch.
    /// </summary>
    private async Task AssertNotMoreThanPayableAsync(RecordVatPaymentCommand command, CancellationToken cancellationToken)
    {
        DateOnly paymentDay = NepalDate.FromUtc(command.PaymentDateUtc);
        decimal position = await VatPosition
            .AsOfAsync(dbContext, NepalDate.EndExclusiveUtc(paymentDay), branchId: null, cancellationToken)
            .ConfigureAwait(false);
        decimal payable = Math.Max(0m, Math.Round(position, 2, MidpointRounding.AwayFromZero));
        if (command.Amount <= payable)
        {
            return;
        }

        string day = paymentDay.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        string message;
        if (payable > 0m)
        {
            message = $"The VAT payable as of {day} is {Format(payable)}; a payment of {Format(command.Amount)} is more "
                + "than that. Pay up to the amount due (a partial payment is fine).";
        }
        else
        {
            string credit = position < 0m ? $" There is an input VAT credit of {Format(-position)} to carry forward." : string.Empty;
            message = $"No VAT is payable as of {day}, so a VAT payment of {Format(command.Amount)} can't be recorded.{credit}";
        }

        throw new CustomException(message, (IEnumerable<string>?)null, HttpStatusCode.UnprocessableEntity);
    }

    private static string Format(decimal amount) => amount.ToString("N2", CultureInfo.InvariantCulture);
}
