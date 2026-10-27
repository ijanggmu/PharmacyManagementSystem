using System.Globalization;
using Microsoft.Extensions.Caching.Hybrid;

namespace FSH.Modules.Appointments.Services;

/// <summary>
/// Cache key, tag and lifetime of the public Explore page. Kept in the module rather than the shared
/// <c>CacheKeys.cs</c> because that file lives in the protected BuildingBlocks. A minute is short enough that
/// places left read as live (booking itself always checks the real count) and long enough that a busy page
/// doesn't read every listed pharmacy's timetable on each visit. Saving appointment settings purges the tag.
/// </summary>
internal static class ExploreCache
{
    public const string Tag = "appointments:explore";

    public static readonly HybridCacheEntryOptions EntryOptions = new()
    {
        Expiration = TimeSpan.FromSeconds(60),
        LocalCacheExpiration = TimeSpan.FromSeconds(30),
    };

    /// <summary>A lookup that never stores the (null) factory result — HybridCache has no TryGet.</summary>
    public static readonly HybridCacheEntryOptions ReadOnlyOptions = new()
    {
        Flags = HybridCacheEntryFlags.DisableLocalCacheWrite | HybridCacheEntryFlags.DisableDistributedCacheWrite,
    };

    /// <summary>One entry per Nepal day, so the page never shows yesterday's sittings after midnight.</summary>
    public static string Key(DateOnly nepalToday) =>
        string.Create(CultureInfo.InvariantCulture, $"{Tag}:{nepalToday:yyyyMMdd}");
}
