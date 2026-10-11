using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.CreateBankStatementImport;

/// <summary>Imports a bank statement (a batch of lines) for reconciliation against one GL account —
/// ported from <c>createBankStatementImport</c> in bank-reconciliation-service.ts.</summary>
public sealed class CreateBankStatementImportCommandHandler(
    AccountingDbContext dbContext, ICurrentUser currentUser, ICurrentBranch currentBranch)
    : ICommandHandler<CreateBankStatementImportCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateBankStatementImportCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var account = await dbContext.Accounts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == command.AccountId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Account {command.AccountId} not found in the chart of accounts.");

        if (account.AccountType != AccountingAccountType.Asset)
        {
            throw new CustomException(
                "A bank statement can only be reconciled against an asset account.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var lines = command.Lines
            .Select(l => new BankStatementLineInput(l.TxnDateUtc, l.Description, l.Reference, l.DebitAmount, l.CreditAmount))
            .ToList();

        // BankStatementImport keeps BranchId nullable (docs/branch-scoping-plan.md §2).
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var import = BankStatementImport.Create(
            command.AccountId,
            command.StatementLabel,
            command.PeriodStartUtc,
            command.PeriodEndUtc,
            command.OpeningBalance,
            command.ClosingBalance,
            lines,
            currentUser.Name ?? currentUser.GetUserId().ToString(),
            branchId);

        dbContext.BankStatementImports.Add(import);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return import.Id;
    }
}
