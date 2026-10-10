using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Purchasing.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Purchasing.Tests.Features;

/// <summary>
/// Builds a real <see cref="PurchasingDbContext"/> over EF Core's InMemory provider for handler
/// tests. Same shape as Inventory.Tests/Features/InventoryDbContextFactory.cs and
/// Sales.Tests/Features/SalesDbContextFactory.cs.
/// </summary>
internal static class PurchasingDbContextFactory
{
    public static PurchasingDbContext Create(string? databaseName = null)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant")));

        var options = new DbContextOptionsBuilder<PurchasingDbContext>()
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

        return new PurchasingDbContext(accessor, options, settings, environment);
    }
}
