using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.IgnoreBankStatementLine;

/// <summary>Marks a statement line as deliberately not expected in the GL — ported from
/// <c>ignoreBankStatementLine</c> in bank-reconciliation-service.ts. Ignored lines drop out of the
/// difference calculation but stay visible.</summary>
public sealed class IgnoreBankStatementLineCommandHandler(AccountingDbContext dbContext)
    : ICommandHandler<IgnoreBankStatementLineCommand, Guid>
{
    public async ValueTask<Guid> Handle(IgnoreBankStatementLineCommand command, CancellationToken cancellationToken)
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

        import.IgnoreLine(command.LineId, command.Note);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return command.LineId;
    }
}
