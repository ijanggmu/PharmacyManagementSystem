using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.UnmatchBankStatementLine;

/// <summary>Reverts a statement line to unmatched (idempotent, no-op if it already is) — ported
/// from <c>unmatchBankStatementLine</c> in bank-reconciliation-service.ts.</summary>
public sealed class UnmatchBankStatementLineCommandHandler(AccountingDbContext dbContext)
    : ICommandHandler<UnmatchBankStatementLineCommand, Guid>
{
    public async ValueTask<Guid> Handle(UnmatchBankStatementLineCommand command, CancellationToken cancellationToken)
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

        import.UnmatchLine(command.LineId);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return command.LineId;
    }
}
