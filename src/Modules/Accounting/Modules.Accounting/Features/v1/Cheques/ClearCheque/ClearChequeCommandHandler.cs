using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Cheques.ClearCheque;

/// <summary>
/// The bank honoured the cheque. For a post-dated cheque (its payment sits in Cheques in Hand / Cheques Issued) this
/// posts a contra voucher dated at the clearance — received: Dr Bank / Cr Cheques in Hand; issued: Dr Cheques Issued
/// / Cr Bank — together with the status change, in one transaction; a clearance dated in a locked period is refused.
/// A cheque posted straight to the bank only changes status. The bank is the given account, else the deposit
/// account, else the tenant's "cheque" payment account (Bank 1010 by default).
/// </summary>
public sealed class ClearChequeCommandHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IPaymentMethodAccountResolver paymentAccounts,
    AccountingPostingLockService postingLockService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<ClearChequeCommand, ChequeDto>
{
    public const string ReferenceType = "ChequeClearance";
    public const string VoucherType = "system_cheque_clearance";

    public async ValueTask<ChequeDto> Handle(ClearChequeCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var cheque = await ChequeLoader.LoadForUpdateAsync(dbContext, currentBranch, command.ChequeId, cancellationToken).ConfigureAwait(false);
        string actor = ChequeLoader.Actor(currentUser);

        if (!cheque.ClearancePostsVoucher)
        {
            if (command.BankAccountId is { } given)
            {
                await PaymentAccountTargets.EnsureCashBankAsync(dbContext, given, cancellationToken).ConfigureAwait(false);
            }

            cheque.Clear(command.ClearedDateUtc, command.BankAccountId, actor, command.Note);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return ChequeRegister.ToDto(cheque, withHistory: true);
        }

        await postingLockService.AssertPostingOpenAsync(command.ClearedDateUtc, cancellationToken).ConfigureAwait(false);

        Guid bankId = command.BankAccountId
            ?? cheque.BankAccountId
            ?? await paymentAccounts.ResolveAccountIdAsync(PaymentMethodAccounts.Cheque, cancellationToken).ConfigureAwait(false);
        await PaymentAccountTargets.EnsureCashBankAsync(dbContext, bankId, cancellationToken).ConfigureAwait(false);

        // Exists already (the payment was posted to it); created here only if it was since removed from the seed.
        Guid holdingId = await ChequeAccounts.HoldingAccountAsync(dbContext, cheque.Direction, cancellationToken).ConfigureAwait(false);

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            var change = cheque.Clear(command.ClearedDateUtc, bankId, actor, command.Note);

            bool received = cheque.Direction == ChequeDirection.Received;
            string label = $"Cheque {cheque.ChequeNumber}";
            IReadOnlyList<PostVoucherLine> lines = received
                ?
                [
                    new PostVoucherLine(bankId, $"{label} cleared into bank", DebitAmount: cheque.Amount, CreditAmount: 0m),
                    new PostVoucherLine(holdingId, $"{label} out of cheques in hand", DebitAmount: 0m, CreditAmount: cheque.Amount),
                ]
                :
                [
                    new PostVoucherLine(holdingId, $"{label} paid by the bank", DebitAmount: cheque.Amount, CreditAmount: 0m),
                    new PostVoucherLine(bankId, $"{label} cleared from bank", DebitAmount: 0m, CreditAmount: cheque.Amount),
                ];

            string narration = received
                ? $"Cheque {cheque.ChequeNumber} from customer '{cheque.PartyName}' cleared"
                : $"Cheque {cheque.ChequeNumber} to supplier '{cheque.PartyName}' cleared";

            // Saves the cheque's status change with the voucher.
            Guid voucherId = await voucherPostingService.PostSystemVoucherAsync(
                new PostVoucherRequest(
                    VoucherType: VoucherType,
                    ReferenceType: ReferenceType,
                    ReferenceId: cheque.Id,
                    Narration: cheque.BankName is null ? narration : $"{narration} ({cheque.BankName})",
                    Lines: lines,
                    BranchId: cheque.BranchId,
                    VoucherDateUtc: command.ClearedDateUtc),
                cancellationToken).ConfigureAwait(false);

            change.AttachVoucher(voucherId);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return ChequeRegister.ToDto(cheque, withHistory: true);
        }, cancellationToken).ConfigureAwait(false);
    }
}
