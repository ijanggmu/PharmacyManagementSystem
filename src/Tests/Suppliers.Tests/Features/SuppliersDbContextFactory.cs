using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>
/// Builds a real <see cref="SuppliersDbContext"/> over EF Core's InMemory provider for handler tests
/// that need actual query/aggregate behavior — same shape as
/// <c>Accounting.Tests/Features/AccountingDbContextFactory.cs</c>.
/// </summary>
internal static class SuppliersDbContextFactory
{
    public static SuppliersDbContext Create(string? databaseName = null)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant")));

        var options = new DbContextOptionsBuilder<SuppliersDbContext>()
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

        return new SuppliersDbContext(accessor, options, settings, environment);
    }
}
