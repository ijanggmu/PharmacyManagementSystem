using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Cheques.SearchCheques;

public sealed class GetChequeByIdQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetChequeByIdQuery, ChequeDto>
{
    public async ValueTask<ChequeDto> Handle(GetChequeByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        string notFound = $"Cheque {query.Id} not found.";
        var cheque = await dbContext.Cheques
            .AsNoTracking()
            .Include(c => c.History)
            .FirstOrDefaultAsync(c => c.Id == query.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);

        await currentBranch.EnsureCanSeeBranchAsync(cheque.BranchId, notFound, cancellationToken).ConfigureAwait(false);
        return ChequeRegister.ToDto(cheque, withHistory: true);
    }
}
