using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Batches;

/// <summary>Writes off the remaining quantity of a batch (expired/damaged) — zeroes it and marks disposed.
/// <paramref name="Category"/> is one of <see cref="WriteOffReasons.All"/> (null = not classified); it prefixes
/// the movement note and the GL narration so damage/breakage losses can be told apart from expiries.</summary>
public sealed record DisposeBatchCommand(Guid BatchId, string Reason, string? Category = null) : ICommand<Guid>;

/// <summary>The write-off reasons a disposal is classified under.</summary>
public static class WriteOffReasons
{
    public const string Expired = "Expired";
    public const string DamageBreakage = "Damage/Breakage";
    public const string Recalled = "Recalled";
    public const string Other = "Other";

    public static IReadOnlyList<string> All { get; } = [Expired, DamageBreakage, Recalled, Other];

    /// <summary>The note recorded for a write-off: "<c>{category}: {reason}</c>", or the reason alone.</summary>
    public static string Describe(string? category, string reason) =>
        string.IsNullOrWhiteSpace(category) ? reason : $"{category}: {reason}";
}
