using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Appointments.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Appointments.Tests.Features;

/// <summary>A real <see cref="AppointmentsDbContext"/> over EF Core's InMemory provider. Same shape as
/// <c>Prescriptions.Tests/Features/PrescriptionsDbContextFactory.cs</c>.</summary>
internal static class AppointmentsDbContextFactory
{
    /// <summary>A context on an in-memory database as pharmacy <paramref name="tenantId"/>; pass the same database name to see several pharmacies' rows.</summary>
    public static AppointmentsDbContext Create(string? databaseName = null, string tenantId = "test-tenant")
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        var context = new MultiTenantContext<AppTenantInfo>(new AppTenantInfo(tenantId, tenantId));
        accessor.MultiTenantContext.Returns(context);
        // The DbContext reads the non-generic accessor; without this every row is saved with an empty tenant.
        ((IMultiTenantContextAccessor)accessor).MultiTenantContext.Returns(context);

        var options = new DbContextOptionsBuilder<AppointmentsDbContext>()
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

        return new AppointmentsDbContext(accessor, options, settings, environment);
    }
}
