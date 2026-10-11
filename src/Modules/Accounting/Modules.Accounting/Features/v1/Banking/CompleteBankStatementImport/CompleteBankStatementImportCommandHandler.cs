using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.CompleteBankStatementImport;

/// <summary>Finalizes a reconciliation. Rejected unless every statement line is matched/ignored AND
/// every posted GL line on the account for the period is claimed by some statement line — ported
/// from <c>completeBankReconciliation</c> in bank-reconciliation-service.ts.</summary>
public sealed class CompleteBankStatementImportCommandHandler(AccountingDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<CompleteBankStatementImportCommand, Guid>
{
    public async ValueTask<Guid> Handle(CompleteBankStatementImportCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var import = await dbContext.BankStatementImports
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == command.ImportId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Statement import {command.ImportId} not found.");

        int unmatchedStatementLines = import.Lines.Count(l => l.Status == BankStatementLineStatus.Unmatched);
        if (unmatchedStatementLines > 0)
        {
            throw new CustomException(
                $"{unmatchedStatementLines} statement line(s) are still unmatched. Match or ignore every line before completing.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var ledgerLines = await BankReconciliationLedgerQuery
            .GetAsync(dbContext, import.AccountId, import.PeriodStartUtc, import.PeriodEndUtc, import.BranchId, cancellationToken)
            .ConfigureAwait(false);

        var claimed = await BankReconciliationLedgerQuery
            .GetClaimedVoucherLineIdsAsync(dbContext, ledgerLines.Select(l => l.VoucherLineId).ToList(), cancellationToken)
            .ConfigureAwait(false);

        int unmatchedLedgerLines = ledgerLines.Count(l => !claimed.Contains(l.VoucherLineId));
        if (unmatchedLedgerLines > 0)
        {
            throw new CustomException(
                $"{unmatchedLedgerLines} ledger entr(ies) in this period aren't on the statement. Investigate them before completing.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        string reconciledBy = currentUser.Name ?? currentUser.GetUserId().ToString();
        import.Complete(reconciledBy);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return import.Id;
    }
}
