using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Cheques.DepositCheque;

/// <summary>
/// Marks a received cheque deposited (or an issued one presented). Nothing is posted: the money is not in the bank
/// until the cheque clears. The bank account, when given, must be a cash/bank (10xx) account and becomes the
/// clearance's default.
/// </summary>
public sealed class DepositChequeCommandHandler(
    AccountingDbContext dbContext,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<DepositChequeCommand, ChequeDto>
{
    public async ValueTask<ChequeDto> Handle(DepositChequeCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var cheque = await ChequeLoader.LoadForUpdateAsync(dbContext, currentBranch, command.ChequeId, cancellationToken).ConfigureAwait(false);
        if (command.BankAccountId is { } bankAccountId)
        {
            await PaymentAccountTargets.EnsureCashBankAsync(dbContext, bankAccountId, cancellationToken).ConfigureAwait(false);
        }

        cheque.Deposit(command.DepositDateUtc, command.BankAccountId, ChequeLoader.Actor(currentUser), command.Note);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return ChequeRegister.ToDto(cheque, withHistory: true);
    }
}
