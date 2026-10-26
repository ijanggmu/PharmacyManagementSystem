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
    public static AppointmentsDbContext Create(string? databaseName = null)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant")));

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
