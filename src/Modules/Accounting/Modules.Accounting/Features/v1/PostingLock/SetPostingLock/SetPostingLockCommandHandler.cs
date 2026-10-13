using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.PostingLock;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.PostingLock.SetPostingLock;

public sealed class SetPostingLockCommandHandler(
    AccountingDbContext dbContext, AccountingPostingLockService postingLockService, ICurrentUser currentUser)
    : ICommandHandler<SetPostingLockCommand, PostingLockDto>
{
    public async ValueTask<PostingLockDto> Handle(SetPostingLockCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var lockRow = await postingLockService.GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        string updatedBy = currentUser.Name ?? currentUser.GetUserId().ToString();

        // The lock row keeps only the latest value; every actual change is appended to the history,
        // saved in the same SaveChanges so the two can't disagree.
        var change = lockRow.SetLockDate(command.LockDate, updatedBy);
        if (change is not null)
        {
            dbContext.PostingLockChanges.Add(change);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return await PostingLockDtoMapper.ToDtoAsync(dbContext, lockRow, cancellationToken).ConfigureAwait(false);
    }
}
