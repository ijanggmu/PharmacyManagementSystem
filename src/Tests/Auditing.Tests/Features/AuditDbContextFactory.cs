using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Auditing.Tests.Features;

/// <summary>
/// Builds a real <see cref="AuditDbContext"/> over a dedicated in-memory Sqlite connection (NOT EF
/// Core's InMemory provider — <see cref="AuditDbContext.OnModelCreating"/> resolves
/// <c>IRelationalTypeMappingSource</c> to register the <c>AsText</c> jsonb-cast DbFunction, which the
/// InMemory provider never registers and throws on). Sqlite is a real relational provider, so the
/// service resolves; it just can't execute <c>EF.Functions.ILike</c> — those payload-substring filters
/// are covered by Integration.Tests/Tests/Auditing (Testcontainers/real Postgres) instead, matching how
/// the rest of this codebase's other ILike-based search handlers are tested (see AuditPayloadFilterTests,
/// and Inventory.Tests' SearchNepalMedicineCatalogQueryHandlerTests for the same InMemory-vs-ILike gap).
///
/// <see cref="AuditDbContext"/> is sealed, so the connection can't be wrapped for auto-dispose on
/// context teardown — callers must dispose the connection returned alongside the context (see
/// <see cref="AuditTestContext"/>) themselves, e.g. in their own <c>Dispose()</c>.
/// </summary>
internal static class AuditDbContextFactory
{
    public const string DefaultTenantId = "test-tenant";

    public static AuditTestContext Create(string tenantId = DefaultTenantId)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo(tenantId, tenantId)));

#pragma warning disable CA2000 // ownership transfers to the returned AuditTestContext, disposed by the caller
        var connection = new SqliteConnection("DataSource=:memory:");
#pragma warning restore CA2000
        connection.Open();

        var options = new DbContextOptionsBuilder<AuditDbContext>()
            .UseSqlite(connection)
            .Options;

        var settings = Options.Create(new DatabaseOptions
        {
            Provider = "postgresql",
            ConnectionString = string.Empty,
            MigrationsAssembly = "FSH.Starter.Migrations.PostgreSQL",
        });

        var environment = Substitute.For<IHostEnvironment>();
        environment.EnvironmentName.Returns("Production");

#pragma warning disable CA2000 // ownership transfers to the returned AuditTestContext, disposed by the caller
        var db = new AuditDbContext(accessor, options, settings, environment);
#pragma warning restore CA2000
        db.Database.EnsureCreated();
        return new AuditTestContext(db, connection);
    }
}

/// <summary>Bundles an <see cref="AuditDbContext"/> with the Sqlite connection backing it so tests can dispose both.</summary>
internal sealed class AuditTestContext(AuditDbContext db, SqliteConnection connection) : IDisposable
{
    public AuditDbContext Db { get; } = db;

    public void Dispose()
    {
        Db.Dispose();
        connection.Dispose();
    }
}
