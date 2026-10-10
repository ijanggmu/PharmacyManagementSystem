namespace FSH.Modules.Reference.Features.v1.TenantSettings.GetTenantSettings;

/// <summary>
/// The tenant settings store is a flat key/value table with no category column, so a setting's
/// category is derived from its namespaced key: the segment before the first '.', or
/// <see cref="General"/> for a key without one.
/// </summary>
public static class TenantSettingCategory
{
    public const string General = "general";

    public static string Of(string key)
    {
        ArgumentNullException.ThrowIfNull(key);
        int dot = key.IndexOf('.', StringComparison.Ordinal);
        return dot > 0 ? key[..dot] : General;
    }

    public static bool Matches(string key, string category)
    {
        ArgumentNullException.ThrowIfNull(category);
        return string.Equals(Of(key), category.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}
