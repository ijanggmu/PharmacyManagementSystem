using FSH.Framework.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Shouldly;
using Xunit;

namespace Framework.Tests.Persistence;

/// <summary>
/// The registry must see transactions EF opens, so another context on the same connection can join them. Its
/// callbacks only fire when their signatures match IDbTransactionInterceptor, which these tests pin.
/// </summary>
public sealed class AmbientDbTransactionRegistryTests : IAsyncDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly AmbientDbTransactionRegistry _registry = new();

    private sealed class TestContext(DbContextOptions<TestContext> options) : DbContext(options);

    private TestContext NewContext() => new(new DbContextOptionsBuilder<TestContext>()
        .UseSqlite(_connection)
        .AddInterceptors(_registry)
        .Options);

    public async ValueTask DisposeAsync() => await _connection.DisposeAsync();

    [Fact]
    public async Task Find_Should_ReturnTheTransactionOpenedAsync_UntilItCommits()
    {
        await _connection.OpenAsync();
        await using var owner = NewContext();

        await using var transaction = await owner.Database.BeginTransactionAsync();
        _registry.Find(_connection).ShouldBeSameAs(transaction.GetDbTransaction());

        await transaction.CommitAsync();
        _registry.Find(_connection).ShouldBeNull();
    }

    [Fact]
    public async Task Find_Should_ForgetARolledBackTransaction()
    {
        await _connection.OpenAsync();
        await using var owner = NewContext();

        await using var transaction = await owner.Database.BeginTransactionAsync();
        await transaction.RollbackAsync();

        _registry.Find(_connection).ShouldBeNull();
    }

    [Fact]
    public async Task AnotherContext_Should_JoinTheOpenTransaction_ThroughTheRegistry()
    {
        await _connection.OpenAsync();
        await using var owner = NewContext();
        await using var joiner = NewContext();

        await using var transaction = await owner.Database.BeginTransactionAsync();
        var ambient = _registry.Find(_connection);
        ambient.ShouldNotBeNull();

        await joiner.Database.UseTransactionAsync(ambient);
        joiner.Database.CurrentTransaction.ShouldNotBeNull();
        await joiner.Database.UseTransactionAsync(null);

        _registry.Find(_connection).ShouldBeSameAs(transaction.GetDbTransaction());
    }
}
