using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Reference.Data;
using FSH.Modules.Reference.Domain;
using FSH.Modules.Tickets.Contracts.Dtos;
using FSH.Modules.Tickets.Data;
using FSH.Modules.Tickets.Domain;
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
/// and Tickets' <see cref="TicketsDbContext"/>) can share one ambient database transaction, the way
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
        var ticketsDb = scope.ServiceProvider.GetRequiredService<TicketsDbContext>();
        await referenceDb.Database.MigrateAsync();
        await ticketsDb.Database.MigrateAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Rollback_On_The_First_Context_Should_Undo_The_Second_Contexts_Write_Too()
    {
        Guid categoryId;
        Guid ticketId;

        await using (var provider = BuildServiceProvider())
        await using (var scope = provider.CreateAsyncScope())
        {
            var referenceDb = scope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
            var ticketsDb = scope.ServiceProvider.GetRequiredService<TicketsDbContext>();
            var ambientTransactions = scope.ServiceProvider.GetRequiredService<AmbientDbTransactionRegistry>();

            var category = MedicineCategory.Create("SPIKE-0 rollback category", null, null);
            categoryId = category.Id;
            var ticket = NewTicket("SPIKE-0 rollback ticket");
            ticketId = ticket.Id;

            // DIAGNOSTIC: are the two contexts actually sharing one physical connection object?
            ReferenceEquals(referenceDb.Database.GetDbConnection(), ticketsDb.Database.GetDbConnection())
                .ShouldBeTrue("Reference and Tickets should share one DbConnection via IScopedDbConnectionProvider.");

            // Reference opens the ambient transaction on the scope's shared connection.
            var tx = await referenceDb.Database.BeginTransactionAsync();

            referenceDb.MedicineCategories.Add(category);
            await referenceDb.SaveChangesAsync();

            // DIAGNOSTIC (non-fatal): does the registry auto-track the transaction via the
            // interceptor? Captured, not asserted, so the test can still prove/disprove the
            // underlying connection-sharing mechanism even if auto-tracking doesn't work.
            var ambientOnReferenceItself = ambientTransactions.Find(referenceDb.Database.GetDbConnection());
            var ambient = ambientTransactions.Find(ticketsDb.Database.GetDbConnection());
            Console.WriteLine($"[DIAGNOSTIC] registry found ambient on referenceDb's own connection: {ambientOnReferenceItself is not null}");
            Console.WriteLine($"[DIAGNOSTIC] registry found ambient via ticketsDb's connection: {ambient is not null}");

            // Tickets enlists in that SAME transaction before writing — the pattern
            // EfCoreOutboxStore.EnlistInAmbientTransactionAsync uses. Falls back to the
            // transaction object itself (not just the registry lookup) to isolate whether
            // cross-context enlistment works at all, independent of the registry's own tracking.
            await ticketsDb.Database.UseTransactionAsync(ambient ?? tx.GetDbTransaction());

            ticketsDb.Tickets.Add(ticket);
            await ticketsDb.SaveChangesAsync();

            // Simulate a failure after both writes: roll back via the ORIGINATING context's transaction.
            await tx.RollbackAsync();
        }

        // Fresh scope, fresh connection — read-your-writes bias ruled out.
        await using var verifyProvider = BuildServiceProvider();
        await using var verifyScope = verifyProvider.CreateAsyncScope();
        var verifyReferenceDb = verifyScope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
        var verifyTicketsDb = verifyScope.ServiceProvider.GetRequiredService<TicketsDbContext>();

        (await verifyReferenceDb.MedicineCategories.AnyAsync(c => c.Id == categoryId))
            .ShouldBeFalse("Reference's write should have rolled back.");
        (await verifyTicketsDb.Tickets.AnyAsync(t => t.Id == ticketId))
            .ShouldBeFalse("Tickets' write, enlisted in Reference's transaction, should have rolled back too.");
    }

    [Fact]
    public async Task Commit_On_The_First_Context_Should_Persist_The_Second_Contexts_Write_Too()
    {
        Guid categoryId;
        Guid ticketId;

        await using (var provider = BuildServiceProvider())
        await using (var scope = provider.CreateAsyncScope())
        {
            var referenceDb = scope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
            var ticketsDb = scope.ServiceProvider.GetRequiredService<TicketsDbContext>();
            var ambientTransactions = scope.ServiceProvider.GetRequiredService<AmbientDbTransactionRegistry>();

            var category = MedicineCategory.Create("SPIKE-0 commit category", null, null);
            categoryId = category.Id;
            var ticket = NewTicket("SPIKE-0 commit ticket");
            ticketId = ticket.Id;

            var tx = await referenceDb.Database.BeginTransactionAsync();

            referenceDb.MedicineCategories.Add(category);
            await referenceDb.SaveChangesAsync();

            var ambient = ambientTransactions.Find(ticketsDb.Database.GetDbConnection());
            await ticketsDb.Database.UseTransactionAsync(ambient);

            ticketsDb.Tickets.Add(ticket);
            await ticketsDb.SaveChangesAsync();

            await tx.CommitAsync();
        }

        await using var verifyProvider = BuildServiceProvider();
        await using var verifyScope = verifyProvider.CreateAsyncScope();
        var verifyReferenceDb = verifyScope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
        var verifyTicketsDb = verifyScope.ServiceProvider.GetRequiredService<TicketsDbContext>();

        (await verifyReferenceDb.MedicineCategories.AnyAsync(c => c.Id == categoryId))
            .ShouldBeTrue("Reference's write should be committed.");
        (await verifyTicketsDb.Tickets.AnyAsync(t => t.Id == ticketId))
            .ShouldBeTrue("Tickets' write, enlisted in Reference's transaction, should be committed too.");
    }

    private static Ticket NewTicket(string title) =>
        Ticket.Create($"SPK-{Guid.NewGuid():N}"[..20], title, null, TicketPriority.Low, Guid.NewGuid(), null);

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
        services.AddHeroDbContext<TicketsDbContext>();

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
