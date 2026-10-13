using System.Globalization;
using Microsoft.Extensions.Caching.Hybrid;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetOwnerDashboard;

/// <summary>
/// Cache key, tag and lifetime of the owner dashboard. Kept in the module rather than the shared
/// <c>CacheKeys.cs</c> because that file lives in the protected BuildingBlocks. Nothing invalidates the entry
/// on a sale or voucher: a one-minute lifetime is the whole freshness contract, short enough that the figures
/// read as live and long enough to absorb a busy counter reloading the home page.
/// </summary>
public static class OwnerDashboardCache
{
    public static readonly HybridCacheEntryOptions EntryOptions = new()
    {
        Expiration = TimeSpan.FromSeconds(60),
        LocalCacheExpiration = TimeSpan.FromSeconds(30),
    };

    /// <summary>One entry per tenant, resolved branch scope (all = every branch), month start and Nepal day.</summary>
    public static string Key(string tenantId, Guid? branchId, DateTime monthStartUtc, DateOnly nepalToday)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        return string.Create(
            CultureInfo.InvariantCulture,
            $"accounting:owner-dashboard:{tenantId}:{(branchId is { } b ? b.ToString("N") : "all")}:{monthStartUtc:yyyyMMddHHmm}:{nepalToday:yyyyMMdd}");
    }

    /// <summary>Tag covering every owner-dashboard entry of a tenant (for a manual purge).</summary>
    public static string Tag(string tenantId) => $"accounting:owner-dashboard:{tenantId}";
}
