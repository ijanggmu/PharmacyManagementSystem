using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Accounting.Tests.Features;

/// <summary>
/// Builds a real <see cref="AccountingDbContext"/> over EF Core's InMemory provider for handler tests
/// that need actual query/aggregate behavior — same shape as <c>Sales.Tests/Features/SalesDbContextFactory.cs</c>.
/// </summary>
internal static class AccountingDbContextFactory
{
    public static AccountingDbContext Create(string? databaseName = null)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant")));

        var options = new DbContextOptionsBuilder<AccountingDbContext>()
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

        return new AccountingDbContext(accessor, options, settings, environment);
    }
}
