using System.Data.Common;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Prescriptions.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Prescriptions.Tests.Features;

/// <summary>
/// <see cref="PrescriptionWrites.RunInTransactionAsync"/> over a relational provider, now that
/// <see cref="AmbientDbTransactionRegistry"/> actually tracks transactions: a prescription write inside a sale
/// joins the sale's transaction (instead of opening a second one on the shared connection — the old 500), and
/// on its own it opens and commits one.
/// </summary>
public sealed class PrescriptionWritesTransactionTests : IAsyncDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly AmbientDbTransactionRegistry _registry = new();

    private sealed class SaleContext(DbContextOptions<SaleContext> options) : DbContext(options);

    private SaleContext NewSaleContext() => new(new DbContextOptionsBuilder<SaleContext>()
        .UseSqlite(_connection)
        .AddInterceptors(_registry)
        .Options);

    private PrescriptionsDbContext NewPrescriptionsContext()
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant")));
        var environment = Substitute.For<IHostEnvironment>();
        environment.EnvironmentName.Returns("Production");

        var options = new DbContextOptionsBuilder<PrescriptionsDbContext>()
            .UseSqlite(_connection)
            .AddInterceptors(_registry)
            .Options;
        var settings = Options.Create(new DatabaseOptions
        {
            Provider = "postgresql",
            ConnectionString = string.Empty,
            MigrationsAssembly = "FSH.Starter.Migrations.PostgreSQL",
        });
        return new PrescriptionsDbContext(accessor, options, settings, environment);
    }

    public async ValueTask DisposeAsync() => await _connection.DisposeAsync();

    [Fact]
    public async Task RunInTransactionAsync_Should_Join_The_Sale_Transaction_And_Leave_It_Open()
    {
        await _connection.OpenAsync();
        await using var sale = NewSaleContext();
        await using var prescriptions = NewPrescriptionsContext();
        await using var saleTransaction = await sale.Database.BeginTransactionAsync();

        DbTransaction? seenInside = null;
        await PrescriptionWrites.RunInTransactionAsync(prescriptions, _registry, _ =>
        {
            seenInside = prescriptions.Database.CurrentTransaction?.GetDbTransaction();
            return ValueTask.CompletedTask;
        }, CancellationToken.None);

        seenInside.ShouldBeSameAs(saleTransaction.GetDbTransaction());
        prescriptions.Database.CurrentTransaction.ShouldBeNull(); // detached; the sale still owns it
        _registry.Find(_connection).ShouldBeSameAs(saleTransaction.GetDbTransaction());
    }

    [Fact]
    public async Task RunInTransactionAsync_Should_Detach_But_Not_End_The_Sale_Transaction_When_The_Work_Fails()
    {
        await _connection.OpenAsync();
        await using var sale = NewSaleContext();
        await using var prescriptions = NewPrescriptionsContext();
        await using var saleTransaction = await sale.Database.BeginTransactionAsync();

        await Should.ThrowAsync<InvalidOperationException>(async () =>
            await PrescriptionWrites.RunInTransactionAsync(
                prescriptions, _registry, _ => throw new InvalidOperationException("refused"), CancellationToken.None));

        prescriptions.Database.CurrentTransaction.ShouldBeNull();
        _registry.Find(_connection).ShouldBeSameAs(saleTransaction.GetDbTransaction()); // the sale decides
    }

    [Fact]
    public async Task RunInTransactionAsync_Should_Open_And_Commit_Its_Own_Transaction_When_None_Is_Ambient()
    {
        await _connection.OpenAsync();
        await using var prescriptions = NewPrescriptionsContext();

        DbTransaction? seenInside = null;
        await PrescriptionWrites.RunInTransactionAsync(prescriptions, _registry, _ =>
        {
            seenInside = prescriptions.Database.CurrentTransaction?.GetDbTransaction();
            return ValueTask.CompletedTask;
        }, CancellationToken.None);

        seenInside.ShouldNotBeNull();
        prescriptions.Database.CurrentTransaction.ShouldBeNull();
        _registry.Find(_connection).ShouldBeNull(); // committed and forgotten
    }
}
