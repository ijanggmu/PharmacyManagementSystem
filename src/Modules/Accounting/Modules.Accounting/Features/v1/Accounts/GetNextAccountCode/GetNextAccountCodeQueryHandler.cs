using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Accounts.GetNextAccountCode;

public sealed class GetNextAccountCodeQueryHandler(AccountingDbContext dbContext)
    : IQueryHandler<GetNextAccountCodeQuery, string>
{
    public async ValueTask<string> Handle(GetNextAccountCodeQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var parent = await dbContext.Accounts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == query.ParentId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Parent account {query.ParentId} not found.");

        await AccountTreeRules.EnsureCanHoldChildrenAsync(dbContext, parent, cancellationToken).ConfigureAwait(false);

        var taken = await AccountTreeRules.TakenCodesAsync(dbContext, cancellationToken).ConfigureAwait(false);
        try
        {
            return AccountCodeAllocator.NextChildCode(parent, taken);
        }
        catch (InvalidOperationException ex)
        {
            throw AccountTreeRules.BadRequest(ex.Message);
        }
    }
}
