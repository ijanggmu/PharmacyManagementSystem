namespace FSH.Modules.Accounting.Domain;

/// <summary>A Schedule 2 depreciation pool. <see cref="PerAssetUsefulLife"/>: pool E is not a pooled diminishing
/// balance — each intangible is written off over its own useful life.</summary>
public sealed record NepalTaxPool(string Code, string Name, decimal RatePercent, bool PerAssetUsefulLife, string Examples);

/// <summary>
/// Nepal Income Tax Act 2058, Schedule 2 — depreciation pools and their annual rates. THE single place the rates live:
/// edit here when the law changes.
/// <para><b>Confirm against the current Act and Finance Act before relying on these for a return.</b> The rates below
/// are the long-standing Schedule 2 rates (A 5%, B 25%, C 20%, D 15%, E over the asset's useful life); special
/// provisions (e.g. accelerated rates for specified industries, the extra one-third for certain projects, the repair
/// &amp; improvement allowance above 7% of the pool base) are not modelled.</para>
/// </summary>
public static class NepalTaxPoolDefaults
{
    public const string A = "A";
    public const string B = "B";
    public const string C = "C";
    public const string D = "D";
    public const string E = "E";

    public static IReadOnlyList<NepalTaxPool> All { get; } =
    [
        new(A, "Pool A — Buildings & structures", 5m, false, "Buildings, structures and similar works of a permanent nature"),
        new(B, "Pool B — Computers, office equipment & furniture", 25m, false,
            "Computers, data-handling equipment, office equipment, furniture and fixtures"),
        new(C, "Pool C — Vehicles", 20m, false, "Automobiles, buses, minibuses, motorcycles, delivery vans"),
        new(D, "Pool D — Plant, machinery & other assets", 15m, false,
            "Plant and machinery, refrigerators and other tangible assets not in pools A–C"),
        new(E, "Pool E — Intangible assets", 0m, true, "Software licences, patents and other intangibles (cost ÷ useful life)"),
    ];

    /// <summary>The note printed with the tax depreciation schedule.</summary>
    public const string Note =
        "Rates per Income Tax Act 2058 Schedule 2 (A 5%, B 25%, C 20%, D 15%, E cost ÷ useful life) — confirm them against "
        + "the current Act and Finance Act before filing. Additions enter the base in full (Shrawan–Poush), 2/3 (Magh–Chaitra) "
        + "or 1/3 (Baisakh–Ashadh); the rest is added next year.";

    public static NepalTaxPool? Find(string? code) =>
        string.IsNullOrWhiteSpace(code) ? null : All.FirstOrDefault(p => string.Equals(p.Code, code.Trim(), StringComparison.OrdinalIgnoreCase));
}
