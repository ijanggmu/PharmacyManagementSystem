using FSH.Modules.Multitenancy.Data;
using Microsoft.EntityFrameworkCore;

namespace Multitenancy.Tests.Features.Branches;

/// <summary>
/// Builds a real <see cref="TenantDbContext"/> over EF Core's InMemory provider for handler/service
/// tests. Unlike the per-tenant module DbContexts (see Inventory.Tests/SalesDbContextFactory.cs),
/// TenantDbContext's constructor takes only <c>DbContextOptions</c> — it's the catalog database, not
/// a <c>BaseDbContext</c>, so no Finbuckle tenant accessor is needed to construct it.
/// </summary>
internal static class TenantDbContextFactory
{
    public static TenantDbContext Create(string? databaseName = null)
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(databaseName ?? Guid.NewGuid().ToString())
            .Options;

        return new TenantDbContext(options);
    }
}
