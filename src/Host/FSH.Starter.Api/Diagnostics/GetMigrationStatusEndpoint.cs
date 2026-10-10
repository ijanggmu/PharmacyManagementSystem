using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace FSH.Starter.Api.Diagnostics;

/// <summary>
/// Operator diagnostic: EF Core's own applied-vs-pending migration state for every module's
/// DbContext, for the current caller's tenant. .NET-native replacement for the Next.js reference's
/// <c>getMigrationStatus</c> (lib/server/services/system-diagnostics-service.ts, backing
/// <c>GET /api/system/migration-status</c>), which queried an ad-hoc <c>schema_migrations</c> table
/// and probed for specific columns (<c>is_taxable</c>, <c>controlled_substance</c>, …) — an artifact of
/// the old numbered-SQL-script system (<c>scripts/*.sql</c>) that has no equivalent on this side: this
/// backend uses EF Core's own migrations, tracked per DbContext in its migrations-history table. So
/// this endpoint reports EF Core's own <c>GetAppliedMigrationsAsync</c>/<c>GetPendingMigrationsAsync</c>
/// per module DbContext directly, instead of re-implementing ad-hoc schema probing that doesn't apply
/// to this stack.
///
/// Lives in the Host (composition root), not a module: no single module may reference every other
/// module's runtime DbContext type (that's the module-boundary rule) — only the Host, which already
/// references every module to wire it up, is allowed to.
/// </summary>
internal static class GetMigrationStatusEndpoint
{
    // One entry per module DbContext registered with the host. Resolved from the request's own DI
    // scope (not a freshly created one) so Finbuckle's ambient per-tenant context — set by
    // UseHeroMultiTenantDatabases() earlier in the pipeline — still applies to each context's
    // connection resolution.
    internal static readonly (string Module, Type ContextType)[] ModuleDbContexts =
    [
        ("Identity", typeof(FSH.Modules.Identity.Data.IdentityDbContext)),
        ("Multitenancy", typeof(FSH.Modules.Multitenancy.Data.TenantDbContext)),
        ("Auditing", typeof(FSH.Modules.Auditing.Persistence.AuditDbContext)),
        ("Billing", typeof(FSH.Modules.Billing.Data.BillingDbContext)),
        ("Catalog", typeof(FSH.Modules.Catalog.Data.CatalogDbContext)),
        ("Reference", typeof(FSH.Modules.Reference.Data.ReferenceDbContext)),
        ("Accounting", typeof(FSH.Modules.Accounting.Data.AccountingDbContext)),
        ("Inventory", typeof(FSH.Modules.Inventory.Data.InventoryDbContext)),
        ("Purchasing", typeof(FSH.Modules.Purchasing.Data.PurchasingDbContext)),
        ("Prescriptions", typeof(FSH.Modules.Prescriptions.Data.PrescriptionsDbContext)),
        ("Sales", typeof(FSH.Modules.Sales.Data.SalesDbContext)),
        ("Suppliers", typeof(FSH.Modules.Suppliers.Data.SuppliersDbContext)),
        ("Customers", typeof(FSH.Modules.Customers.Data.CustomersDbContext)),
        ("Tickets", typeof(FSH.Modules.Tickets.Data.TicketsDbContext)),
        ("Files", typeof(FSH.Modules.Files.Data.FilesDbContext)),
        ("Chat", typeof(FSH.Modules.Chat.Data.ChatDbContext)),
        ("Notifications", typeof(FSH.Modules.Notifications.Data.NotificationsDbContext)),
        ("Onboarding", typeof(FSH.Modules.Onboarding.Data.OnboardingDbContext)),
        ("Webhooks", typeof(FSH.Modules.Webhooks.Data.WebhookDbContext)),
    ];

    public static void MapGetMigrationStatusEndpoint(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.MapGet("api/v1/system/migration-status", HandleAsync)
            .WithName("GetMigrationStatus")
            .WithTags("System")
            .WithSummary("EF Core applied-vs-pending migrations per module DbContext (operator diagnostic)")
            .RequirePermission(MultitenancyPermissions.Tenants.View);
    }

    internal static async Task<IResult> HandleAsync(IServiceProvider serviceProvider, CancellationToken cancellationToken)
    {
        var contexts = new List<MigrationContextStatusDto>(ModuleDbContexts.Length);

        foreach (var (module, contextType) in ModuleDbContexts)
        {
            try
            {
                var dbContext = (DbContext)serviceProvider.GetRequiredService(contextType);

                var applied = await dbContext.Database.GetAppliedMigrationsAsync(cancellationToken).ConfigureAwait(false);
                var pending = (await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).ToList();

                contexts.Add(new MigrationContextStatusDto(
                    module,
                    dbContext.Database.ProviderName,
                    applied.LastOrDefault(),
                    pending,
                    pending.Count > 0,
                    null));
            }
            // A single module's connection/context failure must not stop reporting on the rest —
            // mirrors GetTenantMigrationsQueryHandler's per-tenant try/catch for the same reason.
#pragma warning disable CA1031
            catch (Exception ex)
            {
                contexts.Add(new MigrationContextStatusDto(module, null, null, [], false, ex.Message));
            }
#pragma warning restore CA1031
        }

        return TypedResults.Ok(new MigrationStatusDto(DateTime.UtcNow, contexts));
    }
}

internal sealed record MigrationContextStatusDto(
    string Module,
    string? Provider,
    string? LastAppliedMigration,
    IReadOnlyList<string> PendingMigrations,
    bool HasPendingMigrations,
    string? Error);

internal sealed record MigrationStatusDto(DateTime GeneratedAtUtc, IReadOnlyList<MigrationContextStatusDto> Contexts);
