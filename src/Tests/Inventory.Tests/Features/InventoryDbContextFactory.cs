using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// Builds a real <see cref="InventoryDbContext"/> over EF Core's InMemory provider for handler tests
/// that need actual query/aggregate behavior spanning sibling entities (StockTransfer +
/// StockTransferBatch, InventoryTransaction joins, etc) — behavior a pure domain-entity test can't
/// exercise. Same shape as Sales.Tests/Features/SalesDbContextFactory.cs, swapping Sales for Inventory.
/// </summary>
internal static class InventoryDbContextFactory
{
    public static InventoryDbContext Create(string? databaseName = null)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant")));

        var options = new DbContextOptionsBuilder<InventoryDbContext>()
            .UseInMemoryDatabase(databaseName ?? Guid.NewGuid().ToString())
            // Handlers open an explicit ReadCommitted transaction; the InMemory store has no transactions.
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;

        var settings = Options.Create(new DatabaseOptions
        {
            Provider = "postgresql",
            ConnectionString = string.Empty,
            MigrationsAssembly = "FSH.Starter.Migrations.PostgreSQL",
        });

        var environment = Substitute.For<IHostEnvironment>();
        environment.EnvironmentName.Returns("Production");

        return new InventoryDbContext(accessor, options, settings, environment);
    }
}
