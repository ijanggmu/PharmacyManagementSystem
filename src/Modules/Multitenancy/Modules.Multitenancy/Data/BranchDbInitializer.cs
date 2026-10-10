using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Multitenancy.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Multitenancy.Data;

/// <summary>
/// Gives every tenant a default branch. Sales, stock receipts, cash shifts and the opening-balance commit
/// all require a branch (<c>ICurrentBranch.RequireBranchIdAsync</c>), so a tenant without one cannot trade.
/// Runs in the per-tenant seed pass (tenant provisioning, DbMigrator <c>seed</c>), which also backfills
/// existing tenants. Idempotent: does nothing once the tenant has any branch.
/// </summary>
public sealed partial class BranchDbInitializer(
    TenantDbContext dbContext,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
    ILogger<BranchDbInitializer> logger) : IDbInitializer
{
    public const string DefaultBranchName = "Main Branch";
    public const string DefaultBranchCode = "MAIN";

    // The branch table lives in the shared catalog database, which the DbMigrator migrates once
    // (not once per tenant), so there is nothing to migrate here.
    public Task MigrateAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        string? tenantId = tenantAccessor.MultiTenantContext?.TenantInfo?.Id;

        // The root tenant is the platform operator, not a pharmacy.
        if (string.IsNullOrWhiteSpace(tenantId)
            || string.Equals(tenantId, MultitenancyConstants.Root.Id, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        bool hasBranch = await dbContext.Branches
            .AnyAsync(b => b.TenantId == tenantId, cancellationToken)
            .ConfigureAwait(false);
        if (hasBranch)
        {
            return;
        }

        dbContext.Branches.Add(Branch.Create(tenantId, DefaultBranchName, DefaultBranchCode, createdBy: "system", isDefault: true));
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        LogSeededDefaultBranch(logger, DefaultBranchCode, tenantId);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "[Multitenancy] seeded default branch {BranchCode} for tenant {TenantId}")]
    private static partial void LogSeededDefaultBranch(ILogger logger, string branchCode, string tenantId);
}
