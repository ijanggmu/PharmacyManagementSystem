using System.Reflection;
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
    private const string ModuleAssemblyPrefix = "FSH.Modules.";

    // One entry per module DbContext, discovered by reflection over the module runtime assemblies
    // this host references (FSH.Modules.{Module}, not .Contracts). Naming the context types here
    // would make the host depend on each module's Data namespace, which the module-boundary
    // architecture tests forbid; discovery also picks up new modules without edits here.
    // Contexts are resolved from the request's own DI scope (not a freshly created one) so
    // Finbuckle's ambient per-tenant context — set by UseHeroMultiTenantDatabases() earlier in the
    // pipeline — still applies to each context's connection resolution.
    internal static readonly (string Module, Type ContextType)[] ModuleDbContexts = DiscoverModuleDbContexts();

    private static (string Module, Type ContextType)[] DiscoverModuleDbContexts() =>
        typeof(GetMigrationStatusEndpoint).Assembly.GetReferencedAssemblies()
            .Where(name => name.Name is { } n
                && n.StartsWith(ModuleAssemblyPrefix, StringComparison.Ordinal)
                && !n.EndsWith(".Contracts", StringComparison.Ordinal))
            .Select(Assembly.Load)
            .SelectMany(assembly => assembly.GetTypes())
            .Where(type => type is { IsClass: true, IsAbstract: false } && typeof(DbContext).IsAssignableFrom(type))
            .Select(type => (Module: type.Assembly.GetName().Name![ModuleAssemblyPrefix.Length..], ContextType: type))
            .OrderBy(entry => entry.Module, StringComparer.Ordinal)
            .ToArray();

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
