using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Onboarding.Contracts.v1.Onboarding;
using FSH.Modules.Onboarding.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Onboarding.Features.v1.Onboarding.CompleteOnboarding;

public sealed class CompleteOnboardingCommandHandler(
    OnboardingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    ICurrentUser currentUser) : ICommandHandler<CompleteOnboardingCommand, Guid>
{
    public async ValueTask<Guid> Handle(CompleteOnboardingCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var status = await dbContext.OnboardingStatuses.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false)
            ?? throw new NotFoundException("No onboarding status found for this tenant.");

        // Guard BEFORE posting anything — Complete() below would also throw, but only after the
        // voucher had already been posted.
        if (status.IsCompleted)
        {
            throw new CustomException(
                "Onboarding has already been completed for this tenant.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        decimal totalAssets = command.OpeningCash + command.OpeningBank + command.OpeningInventoryValue + command.OpeningAccountsReceivable;
        decimal equityPlug = totalAssets - command.OpeningAccountsPayable;

        var lines = new List<PostVoucherLine>();

        async ValueTask AddLineIfPositive(decimal amount, string code, string description, bool debit)
        {
            if (amount <= 0)
            {
                return;
            }

            var accountId = await accountResolver.ResolveByCodeAsync(code, cancellationToken).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(accountId, description, DebitAmount: debit ? amount : 0m, CreditAmount: debit ? 0m : amount));
        }

        await AddLineIfPositive(command.OpeningCash, AccountingSystemAccountCodes.Cash, "Opening cash balance", debit: true).ConfigureAwait(false);
        await AddLineIfPositive(command.OpeningBank, AccountingSystemAccountCodes.Bank, "Opening bank balance", debit: true).ConfigureAwait(false);
        await AddLineIfPositive(command.OpeningInventoryValue, AccountingSystemAccountCodes.Inventory, "Opening inventory value", debit: true).ConfigureAwait(false);
        await AddLineIfPositive(command.OpeningAccountsReceivable, AccountingSystemAccountCodes.AccountsReceivable, "Opening accounts receivable", debit: true).ConfigureAwait(false);
        await AddLineIfPositive(command.OpeningAccountsPayable, AccountingSystemAccountCodes.AccountsPayable, "Opening accounts payable", debit: false).ConfigureAwait(false);

        if (equityPlug != 0)
        {
            var equityId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, cancellationToken).ConfigureAwait(false);
            lines.Add(equityPlug > 0
                ? new PostVoucherLine(equityId, "Opening equity", DebitAmount: 0m, CreditAmount: equityPlug)
                : new PostVoucherLine(equityId, "Opening deficit", DebitAmount: -equityPlug, CreditAmount: 0m));
        }

        var voucherId = await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "opening_balance",
                ReferenceType: "Onboarding",
                ReferenceId: status.Id,
                Narration: command.Notes ?? "Opening balances",
                Lines: lines),
            cancellationToken).ConfigureAwait(false);

        status.Complete(voucherId, currentUser.Name ?? currentUser.GetUserId().ToString());
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return voucherId;
    }
}
