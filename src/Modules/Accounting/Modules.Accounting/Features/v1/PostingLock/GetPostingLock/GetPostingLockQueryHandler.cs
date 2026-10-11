using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.PostingLock;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.PostingLock.GetPostingLock;

public sealed class GetPostingLockQueryHandler(AccountingPostingLockService postingLockService)
    : IQueryHandler<GetPostingLockQuery, PostingLockDto>
{
    public async ValueTask<PostingLockDto> Handle(GetPostingLockQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var lockRow = await postingLockService.GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        return new PostingLockDto(lockRow.LockDate, lockRow.UpdatedAtUtc, lockRow.UpdatedBy);
    }
}
