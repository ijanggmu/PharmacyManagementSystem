using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.AutoMatchBankStatementImport;

/// <summary>Runs <see cref="BankStatementAutoMatcher"/> against the unmatched statement lines and
/// the unclaimed posted GL lines for the account/period — ported from
/// <c>autoMatchBankStatement</c> in bank-reconciliation-service.ts.</summary>
public sealed class AutoMatchBankStatementImportCommandHandler(AccountingDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<AutoMatchBankStatementImportCommand, AutoMatchResultDto>
{
    public async ValueTask<AutoMatchResultDto> Handle(AutoMatchBankStatementImportCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var import = await dbContext.BankStatementImports
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == command.ImportId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Statement import {command.ImportId} not found.");

        if (import.Status == BankStatementImportStatus.Reconciled)
        {
            throw new CustomException(
                "This statement is already reconciled.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var ledgerLines = await BankReconciliationLedgerQuery
            .GetAsync(dbContext, import.AccountId, import.PeriodStartUtc, import.PeriodEndUtc, import.BranchId, cancellationToken)
            .ConfigureAwait(false);

        var claimed = await BankReconciliationLedgerQuery
            .GetClaimedVoucherLineIdsAsync(dbContext, ledgerLines.Select(l => l.VoucherLineId).ToList(), cancellationToken)
            .ConfigureAwait(false);

        var candidates = ledgerLines
            .Where(l => !claimed.Contains(l.VoucherLineId))
            .Select(l => new LedgerMatchCandidate(l.VoucherLineId, l.VoucherDateUtc, l.DebitAmount, l.CreditAmount))
            .ToList();

        var results = BankStatementAutoMatcher.Match(import.Lines, candidates);

        string matchedBy = currentUser.Name ?? currentUser.GetUserId().ToString();
        foreach (var result in results)
        {
            import.MatchLine(result.StatementLineId, result.VoucherLineId, matchedBy);
        }

        if (results.Count > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        return new AutoMatchResultDto(results.Count);
    }
}
