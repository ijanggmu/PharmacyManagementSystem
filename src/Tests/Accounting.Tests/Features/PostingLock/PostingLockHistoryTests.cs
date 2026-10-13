using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.v1.PostingLock;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.PostingLock.GetPostingLock;
using FSH.Modules.Accounting.Features.v1.PostingLock.SetPostingLock;
using FSH.Modules.Accounting.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.PostingLock;

/// <summary>Every posting-lock change is appended to an audit trail (who, when, from → to); the lock row keeps only the latest value.</summary>
public sealed class PostingLockHistoryTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();

    public void Dispose() => _db.Dispose();

    private SetPostingLockCommandHandler SetHandler() => new(_db, new AccountingPostingLockService(_db), _currentUser);

    [Fact]
    public void SetLockDate_Should_ReturnChange_FromTo_And_Nothing_When_Unchanged()
    {
        var lockRow = AccountingPostingLock.CreateEmpty();

        var first = lockRow.SetLockDate(new DateOnly(2026, 3, 31), " ram ");
        first.ShouldNotBeNull();
        (first.FromLockDate, first.ToLockDate, first.ChangedBy).ShouldBe(((DateOnly?)null, (DateOnly?)new DateOnly(2026, 3, 31), "ram"));

        lockRow.SetLockDate(new DateOnly(2026, 3, 31), "ram").ShouldBeNull();

        var cleared = lockRow.SetLockDate(null, "sita");
        cleared.ShouldNotBeNull();
        (cleared.FromLockDate, cleared.ToLockDate).ShouldBe(((DateOnly?)new DateOnly(2026, 3, 31), (DateOnly?)null));
    }

    [Fact]
    public async Task Set_Should_AppendHistory_And_Get_Should_ReturnItNewestFirst()
    {
        _currentUser.Name.Returns("ram", "sita", "sita");

        await SetHandler().Handle(new SetPostingLockCommand(new DateOnly(2026, 3, 31)), CancellationToken.None);
        await SetHandler().Handle(new SetPostingLockCommand(new DateOnly(2026, 4, 30)), CancellationToken.None);
        var last = await SetHandler().Handle(new SetPostingLockCommand(new DateOnly(2026, 4, 30)), CancellationToken.None);

        (await _db.PostingLockChanges.CountAsync()).ShouldBe(2); // the no-op save added nothing
        last.History.Count.ShouldBe(2);

        var dto = await new GetPostingLockQueryHandler(_db, new AccountingPostingLockService(_db))
            .Handle(new GetPostingLockQuery(), CancellationToken.None);

        dto.LockDate.ShouldBe(new DateOnly(2026, 4, 30));
        dto.History.Select(h => (h.FromLockDate, h.ToLockDate, h.ChangedBy)).ShouldBe(
        [
            ((DateOnly?)new DateOnly(2026, 3, 31), (DateOnly?)new DateOnly(2026, 4, 30), "sita"),
            ((DateOnly?)null, (DateOnly?)new DateOnly(2026, 3, 31), "ram"),
        ]);
    }
}
