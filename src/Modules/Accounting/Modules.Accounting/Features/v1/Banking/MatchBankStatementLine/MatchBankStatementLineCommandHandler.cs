using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.MatchBankStatementLine;

/// <summary>Manually pairs one statement line with one posted GL voucher line on the same account —
/// ported from <c>matchBankStatementLine</c> in bank-reconciliation-service.ts.</summary>
public sealed class MatchBankStatementLineCommandHandler(AccountingDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<MatchBankStatementLineCommand, Guid>
{
    public async ValueTask<Guid> Handle(MatchBankStatementLineCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var lineRef = await dbContext.BankStatementLines.AsNoTracking()
            .FirstOrDefaultAsync(l => l.Id == command.LineId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Statement line {command.LineId} not found.");

        var import = await dbContext.BankStatementImports
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == lineRef.ImportId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Statement import {lineRef.ImportId} not found.");

        var line = import.Lines.First(l => l.Id == command.LineId);
        if (line.Status == BankStatementLineStatus.Matched)
        {
            throw new CustomException(
                "This line is already matched — unmatch it first.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var glLine = await dbContext.VoucherLines.AsNoTracking()
            .FirstOrDefaultAsync(v => v.Id == command.VoucherLineId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("Ledger entry not found.");

        if (import.Status == BankStatementImportStatus.Reconciled)
        {
            throw new CustomException(
                "This statement is already reconciled.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (glLine.AccountId != import.AccountId)
        {
            throw new CustomException(
                "That ledger entry belongs to a different account.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        decimal statementAmount = decimal.Round(line.DebitAmount - line.CreditAmount, 2);
        decimal glAmount = decimal.Round(glLine.DebitAmount - glLine.CreditAmount, 2);
        if (statementAmount != glAmount)
        {
            throw new CustomException(
                $"Amounts differ: statement {statementAmount:F2} vs ledger {glAmount:F2}",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        bool alreadyClaimed = await dbContext.BankStatementLines.AsNoTracking()
            .AnyAsync(l => l.Id != command.LineId && l.MatchedVoucherLineId == command.VoucherLineId, cancellationToken)
            .ConfigureAwait(false);
        if (alreadyClaimed)
        {
            throw new CustomException(
                "That ledger entry is already matched to another statement line.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        string matchedBy = currentUser.Name ?? currentUser.GetUserId().ToString();
        import.MatchLine(command.LineId, command.VoucherLineId, matchedBy);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return command.LineId;
    }
}
