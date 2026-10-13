using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.PostingLock;

/// <summary>Builds the <see cref="PostingLockDto"/> (current lock plus its recent change history) for the get and set endpoints.</summary>
internal static class PostingLockDtoMapper
{
    public static async Task<PostingLockDto> ToDtoAsync(
        AccountingDbContext dbContext, AccountingPostingLock lockRow, CancellationToken cancellationToken)
    {
        var history = await dbContext.PostingLockChanges
            .AsNoTracking()
            .OrderByDescending(c => c.ChangedAtUtc)
            .ThenByDescending(c => c.Id)
            .Take(PostingLockDto.MaxHistory)
            .Select(c => new PostingLockChangeDto(c.FromLockDate, c.ToLockDate, c.ChangedBy, c.ChangedAtUtc))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PostingLockDto(lockRow.LockDate, lockRow.UpdatedAtUtc, lockRow.UpdatedBy) { History = history };
    }
}
