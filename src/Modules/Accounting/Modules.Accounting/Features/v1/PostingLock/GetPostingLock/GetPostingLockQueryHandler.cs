using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.PostingLock;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.PostingLock.GetPostingLock;

public sealed class GetPostingLockQueryHandler(AccountingDbContext dbContext, AccountingPostingLockService postingLockService)
    : IQueryHandler<GetPostingLockQuery, PostingLockDto>
{
    public async ValueTask<PostingLockDto> Handle(GetPostingLockQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var lockRow = await postingLockService.GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        return await PostingLockDtoMapper.ToDtoAsync(dbContext, lockRow, cancellationToken).ConfigureAwait(false);
    }
}
