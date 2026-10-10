using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Prescriptions.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Prescriptions.Tests.Features;

/// <summary>
/// Builds a real <see cref="PrescriptionsDbContext"/> over EF Core's InMemory provider for handler tests
/// that need actual query/aggregate behavior. Same shape as
/// <c>Sales.Tests/Features/SalesDbContextFactory.cs</c>.
/// </summary>
internal static class PrescriptionsDbContextFactory
{
    public static PrescriptionsDbContext Create(string? databaseName = null)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant")));

        var options = new DbContextOptionsBuilder<PrescriptionsDbContext>()
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

        return new PrescriptionsDbContext(accessor, options, settings, environment);
    }
}
