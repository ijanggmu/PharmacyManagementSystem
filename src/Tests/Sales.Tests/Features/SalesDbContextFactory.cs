using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Sales.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Sales.Tests.Features;

/// <summary>
/// Builds a real <see cref="SalesDbContext"/> over EF Core's InMemory provider for handler tests that
/// need actual query/aggregate behavior (the cross-return/cross-refund quantity caps, the
/// refund-vs-sale-total cap) — behavior a pure domain-entity test can't exercise, since it spans
/// sibling aggregates. Same accessor/options-construction shape as
/// <c>Framework.Tests/Eventing/EventingDbContextModelTests.cs</c>, swapping Npgsql for InMemory so it
/// runs without a database.
/// </summary>
internal static class SalesDbContextFactory
{
    public static SalesDbContext Create(string? databaseName = null)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant")));

        var options = new DbContextOptionsBuilder<SalesDbContext>()
            .UseInMemoryDatabase(databaseName ?? Guid.NewGuid().ToString())
            .Options;

        var settings = Options.Create(new DatabaseOptions
        {
            Provider = "postgresql",
            ConnectionString = string.Empty,
            MigrationsAssembly = "FSH.Starter.Migrations.PostgreSQL",
        });

        var environment = Substitute.For<IHostEnvironment>();
        environment.EnvironmentName.Returns("Production");

        return new SalesDbContext(accessor, options, settings, environment);
    }
}
