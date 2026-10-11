using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Catalog.Contracts.Authorization;
using FSH.Modules.Identity.Authorization;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using Integration.Tests.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Integration.Tests.Tests.Catalog;

/// <summary>
/// Direct service-level test for <see cref="RolePermissionSyncer"/>. Verifies the
/// "permissions added in a release after tenant was already provisioned" path —
/// which the per-tenant <c>IDbInitializer.SeedAsync</c> flow does not run again
/// for already-provisioned tenants in production. This is the path that produced
/// 401s in dev when the Catalog module was added.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class RolePermissionSyncerTests
{
    private readonly FshWebApplicationFactory _factory;

    public RolePermissionSyncerTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task SyncAsync_Should_Restore_Missing_Permission_Claims_For_Admin_Role()
    {
        var rootTenant = await GetRootTenantAsync();

        var catalogPermissions = CatalogPermissions.All.Select(p => p.Name).ToHashSet(StringComparer.Ordinal);

        // 1. Wipe Admin's Catalog.* claims directly. Simulates "perms registered in a
        //    later release that never made it into this tenant's RoleClaims table."
        await WipeClaimsAsync(rootTenant, "Admin", catalogPermissions);

        var afterWipe = await GetClaimsAsync(rootTenant, "Admin");
        afterWipe.Intersect(catalogPermissions).ShouldBeEmpty(
            "Pre-condition: Admin must not have any Catalog claims after the wipe.");

        // 2. Run the syncer through the production scope/tenant pattern.
        using (var scope = _factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
                .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(rootTenant);

            var syncer = scope.ServiceProvider.GetRequiredService<RolePermissionSyncer>();
            await syncer.SyncAsync(CancellationToken.None);
        }

        // 3. All Catalog perms should be back on the Admin role.
        var afterSync = await GetClaimsAsync(rootTenant, "Admin");
        var missing = catalogPermissions.Where(p => !afterSync.Contains(p)).ToList();
        missing.ShouldBeEmpty(
            $"Syncer failed to restore {missing.Count} catalog permission(s): " +
            $"[{string.Join(", ", missing)}]");
    }

    [Fact]
    public async Task SyncAsync_Should_Be_Idempotent_When_Claims_Already_Exist()
    {
        var rootTenant = await GetRootTenantAsync();
        var before = await GetClaimsAsync(rootTenant, "Admin");

        // Running the syncer twice in a row must not duplicate claims or throw.
        using (var scope = _factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
                .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(rootTenant);

            var syncer = scope.ServiceProvider.GetRequiredService<RolePermissionSyncer>();
            await syncer.SyncAsync(CancellationToken.None);
            await syncer.SyncAsync(CancellationToken.None);
        }

        var after = await GetClaimsAsync(rootTenant, "Admin");
        after.Count.ShouldBe(before.Count, "Syncer must not duplicate existing permission claims.");
    }

    [Fact]
    public async Task SyncAsync_Should_Revoke_NonBasic_Permission_From_Basic_Role()
    {
        // AuditTrails.View used to be basic; a Basic role seeded back then still carries it.
        var rootTenant = await GetRootTenantAsync();
        const string auditView = FSH.Modules.Auditing.Contracts.Authorization.AuditingPermissions.AuditTrails.View;
        await AddClaimAsync(rootTenant, "Basic", auditView);
        (await GetClaimsAsync(rootTenant, "Basic")).ShouldContain(auditView);

        await RunSyncerAsync(rootTenant);

        (await GetClaimsAsync(rootTenant, "Basic")).ShouldNotContain(auditView,
            "Basic is framework-managed: registered non-basic permissions must be revoked.");
    }

    private async Task RunSyncerAsync(AppTenantInfo tenant)
    {
        using var scope = _factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        await scope.ServiceProvider.GetRequiredService<RolePermissionSyncer>().SyncAsync(CancellationToken.None);
    }

    private async Task AddClaimAsync(AppTenantInfo tenant, string roleName, string permission)
    {
        using var scope = _factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<FshRole>>();
        var role = await roleManager.Roles.SingleAsync(r => r.Name == roleName);
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        if (!await db.RoleClaims.AnyAsync(rc => rc.RoleId == role.Id && rc.ClaimValue == permission))
        {
            db.RoleClaims.Add(new FshRoleClaim { RoleId = role.Id, ClaimType = ClaimConstants.Permission, ClaimValue = permission });
            await db.SaveChangesAsync();
        }
    }

    // ─── helpers ─────────────────────────────────────────────────────

    private async Task<AppTenantInfo> GetRootTenantAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>();
        var tenant = await store.GetAsync(MultitenancyConstants.Root.Id);
        tenant.ShouldNotBeNull("Root tenant must be provisioned before this test runs.");
        return tenant;
    }

    private async Task WipeClaimsAsync(AppTenantInfo tenant, string roleName, IReadOnlyCollection<string> claimValues)
    {
        using var scope = _factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<FshRole>>();
        var role = await roleManager.Roles.SingleAsync(r => r.Name == roleName);

        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var values = claimValues.ToHashSet(StringComparer.Ordinal);

        // ExecuteDeleteAsync would be cleaner but the in-memory enumeration is
        // negligible for a handful of claims and avoids parameter-list edge cases.
        var toRemove = await db.RoleClaims
            .Where(rc => rc.RoleId == role.Id && rc.ClaimType == ClaimConstants.Permission)
            .ToListAsync();

        db.RoleClaims.RemoveRange(toRemove.Where(rc => rc.ClaimValue is not null && values.Contains(rc.ClaimValue)));
        await db.SaveChangesAsync();
    }

    private async Task<HashSet<string>> GetClaimsAsync(AppTenantInfo tenant, string roleName)
    {
        using var scope = _factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<FshRole>>();
        var role = await roleManager.Roles.SingleAsync(r => r.Name == roleName);

        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var claims = await db.RoleClaims
            .Where(rc => rc.RoleId == role.Id && rc.ClaimType == ClaimConstants.Permission)
            .Select(rc => rc.ClaimValue!)
            .ToListAsync();

        return claims.ToHashSet(StringComparer.Ordinal);
    }
}
