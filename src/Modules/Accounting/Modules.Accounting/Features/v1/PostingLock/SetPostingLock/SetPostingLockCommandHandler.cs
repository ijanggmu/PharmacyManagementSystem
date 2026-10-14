using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
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

        // A closed fiscal year stays locked: moving the lock back (or clearing it) would let vouchers into the
        // year without reversing its closing vouchers. Reopening the year is the way back in.
        DateOnly? closedThrough = await postingLockService.GetClosedThroughAsync(cancellationToken).ConfigureAwait(false);
        if (closedThrough is { } closedEnd && (command.LockDate is not { } requested || requested < closedEnd))
        {
            throw new CustomException(
                $"The books are closed up to {closedEnd:yyyy-MM-dd} by a fiscal-year close, so the posting lock can't be cleared or moved before that day. " +
                "Reopen the fiscal year first.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

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
