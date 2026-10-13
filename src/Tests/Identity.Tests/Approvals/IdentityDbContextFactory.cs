using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Identity.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Identity.Tests.Approvals;

/// <summary>
/// A real <see cref="IdentityDbContext"/> over EF Core's InMemory provider (same construction shape as Sales.Tests'
/// SalesDbContextFactory), for approval-grant and role-claim tests that need actual query/concurrency behaviour.
/// </summary>
internal static class IdentityDbContextFactory
{
    public const string TenantId = "test-tenant";

    public static IdentityDbContext Create(string? databaseName = null, string tenantId = TenantId)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo(tenantId, tenantId)));

        var options = new DbContextOptionsBuilder<IdentityDbContext>()
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

        return new IdentityDbContext(accessor, options, settings, environment);
    }
}
