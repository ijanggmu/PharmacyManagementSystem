using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Tds;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Tds.RecordTdsPayment;

/// <summary>Posts a TDS deposit with IRD: Dr TDS Payable / Cr the money account the tenant maps the payment method
/// to, dated at the payment date. A date in a locked period is refused (the user picked it). The amount may not
/// exceed the TDS Payable balance as of the end of the payment's Nepal day (tenant-wide); a partial deposit is
/// fine.</summary>
public sealed class RecordTdsPaymentCommandHandler(
    IVoucherPostingService voucherPostingService,
    IPaymentMethodAccountResolver paymentAccounts,
    ICurrentBranch currentBranch,
    AccountingPostingLockService postingLockService,
    AccountingDbContext dbContext) : ICommandHandler<RecordTdsPaymentCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordTdsPaymentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await postingLockService.AssertPostingOpenAsync(command.PaymentDateUtc, cancellationToken).ConfigureAwait(false);

        DateOnly paymentDay = NepalDate.FromUtc(command.PaymentDateUtc);
        decimal balance = await TdsPayableAccount
            .BalanceAsOfAsync(dbContext, NepalDate.EndExclusiveUtc(paymentDay), cancellationToken)
            .ConfigureAwait(false);
        EnsureWithinPayable(command.Amount, balance, paymentDay);

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var tdsPayableId = await TdsPayableAccount.GetOrCreateAsync(dbContext, cancellationToken).ConfigureAwait(false);
        bool cash = PaymentMethodAccounts.IsCash(command.PaymentMethod);
        var moneyAccountId = await paymentAccounts.ResolveAccountIdAsync(command.PaymentMethod, cancellationToken).ConfigureAwait(false);
        await CashOnHand.EnsureAvailableAsync(dbContext, paymentAccounts, moneyAccountId, branchId, command.Amount, cancellationToken).ConfigureAwait(false);

        string reference = string.IsNullOrWhiteSpace(command.Reference) ? string.Empty : $" (ref {command.Reference.Trim()})";
        string narration = string.IsNullOrWhiteSpace(command.Narration)
            ? $"TDS deposited with IRD{reference}"
            : $"{command.Narration.Trim()}{reference}";

        // A single voucher write — PostSystemVoucherAsync saves once, so no extra transaction is needed.
        return await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: TdsVouchers.PaymentVoucherType,
                ReferenceType: TdsVouchers.PaymentReferenceType,
                ReferenceId: Guid.CreateVersion7(),
                Narration: narration,
                Lines:
                [
                    new PostVoucherLine(tdsPayableId, "TDS payable deposited", DebitAmount: command.Amount, CreditAmount: 0m),
                    new PostVoucherLine(moneyAccountId, cash ? "Paid in cash" : "Paid from bank", DebitAmount: 0m, CreditAmount: command.Amount),
                ],
                BranchId: branchId,
                VoucherDateUtc: command.PaymentDateUtc),
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Refuses a deposit larger than the TDS Payable balance (rounded to the paisa) on the payment day.</summary>
    internal static void EnsureWithinPayable(decimal amount, decimal balance, DateOnly paymentDay)
    {
        decimal payable = Math.Max(0m, Math.Round(balance, 2, MidpointRounding.AwayFromZero));
        if (amount <= payable)
        {
            return;
        }

        string day = paymentDay.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        string message = payable > 0m
            ? $"The TDS payable as of {day} is {Format(payable)}; a deposit of {Format(amount)} is more than that. "
                + "Deposit up to the amount withheld (a partial deposit is fine)."
            : $"No TDS is payable as of {day}, so a TDS deposit of {Format(amount)} can't be recorded.";
        throw new CustomException(message, (IEnumerable<string>?)null, HttpStatusCode.UnprocessableEntity);
    }

    private static string Format(decimal amount) => amount.ToString("N2", CultureInfo.InvariantCulture);
}
