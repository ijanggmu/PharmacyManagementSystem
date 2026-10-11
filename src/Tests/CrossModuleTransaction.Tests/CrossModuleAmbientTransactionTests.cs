using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Catalog.Data;
using FSH.Modules.Catalog.Domain;
using FSH.Modules.Reference.Data;
using FSH.Modules.Reference.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using Shouldly;
using Xunit;

namespace CrossModuleTransaction.Tests;

/// <summary>
/// SPIKE-0 (see docs/pharmacy-modules-plan.md §2): proves — or disproves — that two DIFFERENT
/// modules' <c>BaseDbContext</c>-derived DbContexts (here: Reference's <see cref="ReferenceDbContext"/>
/// and Catalog's <see cref="CatalogDbContext"/>) can share one ambient database transaction, the way
/// the framework's Outbox already does between a module context and <c>EventingDbContext</c>
/// (<c>EfCoreOutboxStore.EnlistInAmbientTransactionAsync</c>).
///
/// This is the load-bearing assumption behind keeping Sales/Inventory/Accounting as separate
/// modules instead of merging them into one to guarantee atomicity natively. If either fact below
/// stops holding, the pharmacy-modules-plan's SPIKE-0 fallback (merge into one module) applies.
/// </summary>
public sealed class CrossModuleAmbientTransactionTests : IAsyncLifetime
{
    // Points at a plain `docker run postgres:16-alpine -p 55432:5432 ...` container started
    // manually outside this test run — NOT Testcontainers.PostgreSql, which transitively pulls a
    // vulnerable SSH.NET that this repo's NuGet audit policy refuses to restore (see
    // docs/pharmacy-modules-plan.md §0). Same proof, no blocked dependency.
    private const string ConnectionString = "Host=localhost;Port=55432;Database=spike0;Username=spike0;Password=spike0";

    public async Task InitializeAsync()
    {
        // Apply both modules' migrations once, up front, using a throwaway provider.
        await using var provider = BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var referenceDb = scope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
        var catalogDb = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
        await referenceDb.Database.MigrateAsync();
        await catalogDb.Database.MigrateAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Rollback_On_The_First_Context_Should_Undo_The_Second_Contexts_Write_Too()
    {
        Guid categoryId;
        Guid brandId;

        await using (var provider = BuildServiceProvider())
        await using (var scope = provider.CreateAsyncScope())
        {
            var referenceDb = scope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
            var catalogDb = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
            var ambientTransactions = scope.ServiceProvider.GetRequiredService<AmbientDbTransactionRegistry>();

            var category = MedicineCategory.Create("SPIKE-0 rollback category", null, null);
            categoryId = category.Id;
            var brand = Brand.Create("SPIKE-0 rollback brand", null, null);
            brandId = brand.Id;

            // DIAGNOSTIC: are the two contexts actually sharing one physical connection object?
            ReferenceEquals(referenceDb.Database.GetDbConnection(), catalogDb.Database.GetDbConnection())
                .ShouldBeTrue("Reference and Catalog should share one DbConnection via IScopedDbConnectionProvider.");

            // Reference opens the ambient transaction on the scope's shared connection.
            var tx = await referenceDb.Database.BeginTransactionAsync();

            referenceDb.MedicineCategories.Add(category);
            await referenceDb.SaveChangesAsync();

            // DIAGNOSTIC (non-fatal): does the registry auto-track the transaction via the
            // interceptor? Captured, not asserted, so the test can still prove/disprove the
            // underlying connection-sharing mechanism even if auto-tracking doesn't work.
            var ambientOnReferenceItself = ambientTransactions.Find(referenceDb.Database.GetDbConnection());
            var ambient = ambientTransactions.Find(catalogDb.Database.GetDbConnection());
            Console.WriteLine($"[DIAGNOSTIC] registry found ambient on referenceDb's own connection: {ambientOnReferenceItself is not null}");
            Console.WriteLine($"[DIAGNOSTIC] registry found ambient via catalogDb's connection: {ambient is not null}");

            // Catalog enlists in that SAME transaction before writing — the pattern
            // EfCoreOutboxStore.EnlistInAmbientTransactionAsync uses. Falls back to the
            // transaction object itself (not just the registry lookup) to isolate whether
            // cross-context enlistment works at all, independent of the registry's own tracking.
            await catalogDb.Database.UseTransactionAsync(ambient ?? tx.GetDbTransaction());

            catalogDb.Brands.Add(brand);
            await catalogDb.SaveChangesAsync();

            // Simulate a failure after both writes: roll back via the ORIGINATING context's transaction.
            await tx.RollbackAsync();
        }

        // Fresh scope, fresh connection — read-your-writes bias ruled out.
        await using var verifyProvider = BuildServiceProvider();
        await using var verifyScope = verifyProvider.CreateAsyncScope();
        var verifyReferenceDb = verifyScope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
        var verifyCatalogDb = verifyScope.ServiceProvider.GetRequiredService<CatalogDbContext>();

        (await verifyReferenceDb.MedicineCategories.AnyAsync(c => c.Id == categoryId))
            .ShouldBeFalse("Reference's write should have rolled back.");
        (await verifyCatalogDb.Brands.AnyAsync(b => b.Id == brandId))
            .ShouldBeFalse("Catalog's write, enlisted in Reference's transaction, should have rolled back too.");
    }

    [Fact]
    public async Task Commit_On_The_First_Context_Should_Persist_The_Second_Contexts_Write_Too()
    {
        Guid categoryId;
        Guid brandId;

        await using (var provider = BuildServiceProvider())
        await using (var scope = provider.CreateAsyncScope())
        {
            var referenceDb = scope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
            var catalogDb = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
            var ambientTransactions = scope.ServiceProvider.GetRequiredService<AmbientDbTransactionRegistry>();

            var category = MedicineCategory.Create("SPIKE-0 commit category", null, null);
            categoryId = category.Id;
            var brand = Brand.Create("SPIKE-0 commit brand", null, null);
            brandId = brand.Id;

            var tx = await referenceDb.Database.BeginTransactionAsync();

            referenceDb.MedicineCategories.Add(category);
            await referenceDb.SaveChangesAsync();

            var ambient = ambientTransactions.Find(catalogDb.Database.GetDbConnection());
            await catalogDb.Database.UseTransactionAsync(ambient);

            catalogDb.Brands.Add(brand);
            await catalogDb.SaveChangesAsync();

            await tx.CommitAsync();
        }

        await using var verifyProvider = BuildServiceProvider();
        await using var verifyScope = verifyProvider.CreateAsyncScope();
        var verifyReferenceDb = verifyScope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
        var verifyCatalogDb = verifyScope.ServiceProvider.GetRequiredService<CatalogDbContext>();

        (await verifyReferenceDb.MedicineCategories.AnyAsync(c => c.Id == categoryId))
            .ShouldBeTrue("Reference's write should be committed.");
        (await verifyCatalogDb.Brands.AnyAsync(b => b.Id == brandId))
            .ShouldBeTrue("Catalog's write, enlisted in Reference's transaction, should be committed too.");
    }

    private static ServiceProvider BuildServiceProvider()
    {
        var services = new ServiceCollection();

        services.AddSingleton<IHostEnvironment>(new StubEnvironment());
        services.AddSingleton(Options.Create(new DatabaseOptions
        {
            Provider = DbProviders.PostgreSQL,
            ConnectionString = ConnectionString,
            MigrationsAssembly = "FSH.Starter.Migrations.PostgreSQL",
        }));

        // The tenant's own ConnectionString is deliberately empty: this is the "shared database,
        // schema-per-module, filtered by TenantId" path every non-per-tenant-DB tenant takes in
        // production, and it's the path that routes through IScopedDbConnectionProvider.
        var tenant = new AppTenantInfo("spike0", "SPIKE-0 tenant", null, "spike0@example.test");
        services.AddSingleton<IMultiTenantContextAccessor<AppTenantInfo>>(
            new StubTenantAccessor(new MultiTenantContext<AppTenantInfo>(tenant)));

        // Deliberately NOT calling AddHeroDatabaseOptions: no ISaveChangesInterceptor is registered
        // (audit/domain-event publishing are irrelevant to what this spike is proving), so
        // AddHeroDbContext's `sp.GetServices<ISaveChangesInterceptor>()` just resolves empty.
        services.AddScoped<IScopedDbConnectionProvider, ScopedDbConnectionProvider>();
        services.AddScoped<AmbientDbTransactionRegistry>();

        services.AddHeroDbContext<ReferenceDbContext>();
        services.AddHeroDbContext<CatalogDbContext>();

        return services.BuildServiceProvider();
    }

    private sealed class StubTenantAccessor(IMultiTenantContext<AppTenantInfo> context)
        : IMultiTenantContextAccessor<AppTenantInfo>
    {
        public IMultiTenantContext<AppTenantInfo> MultiTenantContext { get; set; } = context;

        IMultiTenantContext IMultiTenantContextAccessor.MultiTenantContext => MultiTenantContext;
    }

    private sealed class StubEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "CrossModuleTransaction.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
