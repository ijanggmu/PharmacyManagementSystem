using System.Globalization;
using System.Text.Json;

namespace FSH.Modules.Reference.Contracts.Controls;

/// <summary>A discount ceiling in percent of the gross amount; <c>null</c> = unlimited.</summary>
public sealed record DiscountCap(decimal? LinePercent, decimal? BillPercent)
{
    public static DiscountCap Unlimited { get; } = new(null, null);
}

/// <summary>
/// The pharmacy's internal controls, kept as tenant settings under the <c>controls.*</c> keys (Settings → System →
/// Internal controls). Missing or unreadable values fall back to <see cref="Default"/>.
/// <list type="bullet">
/// <item><see cref="DiscountCapsKey"/>: JSON <c>{ "Cashier": { "line": 5, "bill": 5 }, ... }</c> — per role, the most a
/// user may discount one line / the whole bill without a manager approval (<c>null</c> = unlimited). The
/// <see cref="OtherRoles"/> entry (<c>"*"</c>) covers users none of whose roles is listed. Admin is always unlimited.</item>
/// <item><see cref="RefundApprovalThresholdKey"/>: a refund whose net amount is above this needs a manager approval
/// (unless the user may approve themselves).</item>
/// <item><see cref="VoucherCreatorCannotPostKey"/>: segregation of duties — the user who drafted (or last edited) a
/// manual voucher can't post it; someone else holding Post must.</item>
/// <item><see cref="RequireOpenShiftKey"/>: a sale that takes cash needs an open cash shift at the branch, so every
/// rupee lands in a drawer that is counted at Z-out. On unless stored as <c>false</c> (a pharmacy that runs no
/// drawer).</item>
/// <item><see cref="PoSecondApproverKey"/>: segregation of duties on buying — the user who created (or last edited) a
/// purchase order can't approve it; someone else holding Approve must. Off unless stored as <c>true</c>, so a
/// one-person pharmacy can still approve its own orders.</item>
/// </list>
/// </summary>
public sealed record InternalControlSettings(
    IReadOnlyDictionary<string, DiscountCap> DiscountCaps,
    decimal RefundApprovalThreshold,
    bool VoucherCreatorCannotPost,
    bool RequireOpenShift = true,
    bool PoSecondApprover = false)
{
    public const string Category = "controls";
    public const string DiscountCapsKey = "controls.discount_caps";
    public const string RefundApprovalThresholdKey = "controls.refund_approval_threshold";
    public const string VoucherCreatorCannotPostKey = "controls.voucher_creator_cannot_post";
    public const string RequireOpenShiftKey = "controls.require_open_shift";
    public const string PoSecondApproverKey = "controls.po_second_approver";

    /// <summary>The discount-caps entry for users none of whose roles has its own entry.</summary>
    public const string OtherRoles = "*";

    /// <summary>The built-in Admin role: never capped.</summary>
    public const string AdminRole = "Admin";

    public static IReadOnlyDictionary<string, DiscountCap> DefaultDiscountCaps { get; } =
        new Dictionary<string, DiscountCap>(StringComparer.OrdinalIgnoreCase)
        {
            ["Cashier"] = new(5m, 5m),
            ["Pharmacist"] = new(10m, 10m),
            ["Manager"] = DiscountCap.Unlimited,
            [OtherRoles] = new(5m, 5m),
        };

    public static InternalControlSettings Default { get; } = new(DefaultDiscountCaps, 1000m, false);

    public static InternalControlSettings From(IReadOnlyDictionary<string, string>? settings)
    {
        if (settings is null || settings.Count == 0)
        {
            return Default;
        }

        string? Get(string key) =>
            settings.FirstOrDefault(kv => string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase)).Value;

        decimal threshold = decimal.TryParse(Get(RefundApprovalThresholdKey), NumberStyles.Number, CultureInfo.InvariantCulture, out var t) && t >= 0m
            ? t
            : Default.RefundApprovalThreshold;

        return new InternalControlSettings(
            ParseDiscountCaps(Get(DiscountCapsKey)),
            threshold,
            string.Equals(Get(VoucherCreatorCannotPostKey)?.Trim(), "true", StringComparison.OrdinalIgnoreCase),
            !string.Equals(Get(RequireOpenShiftKey)?.Trim(), "false", StringComparison.OrdinalIgnoreCase),
            string.Equals(Get(PoSecondApproverKey)?.Trim(), "true", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// The defaults overlaid with the stored JSON. An entry the JSON doesn't mention keeps its default; a malformed
    /// document is ignored as a whole; percents are clamped to 0-100.
    /// </summary>
    public static IReadOnlyDictionary<string, DiscountCap> ParseDiscountCaps(string? json)
    {
        var caps = new Dictionary<string, DiscountCap>(DefaultDiscountCaps, StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(json))
        {
            return caps;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return caps;
            }

            foreach (var role in document.RootElement.EnumerateObject())
            {
                if (string.IsNullOrWhiteSpace(role.Name) || role.Value.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                caps[role.Name.Trim()] = new DiscountCap(Percent(role.Value, "line"), Percent(role.Value, "bill"));
            }
        }
        catch (JsonException)
        {
            return new Dictionary<string, DiscountCap>(DefaultDiscountCaps, StringComparer.OrdinalIgnoreCase);
        }

        return caps;
    }

    private static decimal? Percent(JsonElement entry, string name)
    {
        foreach (var property in entry.EnumerateObject())
        {
            if (!string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return property.Value.ValueKind == JsonValueKind.Number && property.Value.TryGetDecimal(out var value)
                ? Math.Clamp(value, 0m, 100m)
                : null;
        }

        return null;
    }

    /// <summary>
    /// The effective cap for a user with <paramref name="roleNames"/>: Admin is unlimited; otherwise the most
    /// generous cap among the user's roles that have their own entry (an unlimited one wins), or the
    /// <see cref="OtherRoles"/> entry when none has. Line and bill are resolved independently.
    /// </summary>
    public DiscountCap CapFor(IEnumerable<string> roleNames)
    {
        ArgumentNullException.ThrowIfNull(roleNames);
        var roles = roleNames.Where(r => !string.IsNullOrWhiteSpace(r)).Select(r => r.Trim()).ToList();
        if (roles.Exists(r => string.Equals(r, AdminRole, StringComparison.OrdinalIgnoreCase)))
        {
            return DiscountCap.Unlimited;
        }

        var lookup = new Dictionary<string, DiscountCap>(DiscountCaps, StringComparer.OrdinalIgnoreCase);
        var matched = roles
            .Where(r => !string.Equals(r, OtherRoles, StringComparison.Ordinal) && lookup.ContainsKey(r))
            .Select(r => lookup[r])
            .ToList();
        if (matched.Count == 0)
        {
            return lookup.TryGetValue(OtherRoles, out var other) ? other : DiscountCap.Unlimited;
        }

        return new DiscountCap(MostGenerous(matched.Select(c => c.LinePercent)), MostGenerous(matched.Select(c => c.BillPercent)));
    }

    private static decimal? MostGenerous(IEnumerable<decimal?> caps)
    {
        decimal max = 0m;
        foreach (var cap in caps)
        {
            if (cap is null)
            {
                return null;
            }

            max = Math.Max(max, cap.Value);
        }

        return max;
    }

    /// <summary>The discount caps as the JSON stored under <see cref="DiscountCapsKey"/>.</summary>
    public static string SerializeDiscountCaps(IReadOnlyDictionary<string, DiscountCap> caps)
    {
        ArgumentNullException.ThrowIfNull(caps);
        var document = caps.ToDictionary(
            kv => kv.Key,
            kv => new Dictionary<string, decimal?> { ["line"] = kv.Value.LinePercent, ["bill"] = kv.Value.BillPercent },
            StringComparer.Ordinal);
        return JsonSerializer.Serialize(document);
    }
}
