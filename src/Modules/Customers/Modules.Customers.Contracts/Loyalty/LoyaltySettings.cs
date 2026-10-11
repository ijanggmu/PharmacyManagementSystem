using System.Globalization;

namespace FSH.Modules.Customers.Contracts.Loyalty;

/// <summary>
/// The pharmacy's loyalty programme, kept as tenant settings under the <c>loyalty.*</c> keys
/// (Settings → Loyalty). Members earn one point per <see cref="AmountPerPoint"/> spent and may
/// redeem points at <see cref="PointValue"/> each; members also get <see cref="MemberDiscountPercent"/>
/// off at the counter. Missing or unreadable values fall back to the defaults (programme off).
/// </summary>
public sealed record LoyaltySettings(
    bool Enabled,
    decimal AmountPerPoint,
    decimal PointValue,
    decimal MemberDiscountPercent,
    int MinRedeemPoints)
{
    public const string Category = "loyalty";
    public const string EnabledKey = "loyalty.enabled";
    public const string AmountPerPointKey = "loyalty.amount_per_point";
    public const string PointValueKey = "loyalty.point_value";
    public const string MemberDiscountPercentKey = "loyalty.member_discount_percent";
    public const string MinRedeemPointsKey = "loyalty.min_redeem_points";

    public static LoyaltySettings Default { get; } = new(false, 100m, 1m, 0m, 0);

    public static LoyaltySettings From(IReadOnlyDictionary<string, string> settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        string? Get(string key) =>
            settings.FirstOrDefault(kv => string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase)).Value;

        decimal Dec(string key, decimal fallback, decimal min) =>
            decimal.TryParse(Get(key), NumberStyles.Number, CultureInfo.InvariantCulture, out var v) && v >= min ? v : fallback;

        return new LoyaltySettings(
            Enabled: string.Equals(Get(EnabledKey)?.Trim(), "true", StringComparison.OrdinalIgnoreCase),
            AmountPerPoint: Dec(AmountPerPointKey, Default.AmountPerPoint, 0.01m),
            PointValue: Dec(PointValueKey, Default.PointValue, 0m),
            MemberDiscountPercent: Math.Min(100m, Dec(MemberDiscountPercentKey, Default.MemberDiscountPercent, 0m)),
            MinRedeemPoints: int.TryParse(Get(MinRedeemPointsKey), NumberStyles.Integer, CultureInfo.InvariantCulture, out var min) && min >= 0
                ? min
                : Default.MinRedeemPoints);
    }

    /// <summary>Whole points earned on a sale of <paramref name="amount"/> (rounded down).</summary>
    public int PointsEarnedOn(decimal amount) =>
        Enabled && amount > 0 ? (int)Math.Floor(amount / AmountPerPoint) : 0;

    /// <summary>Money value of <paramref name="points"/> when redeemed.</summary>
    public decimal ValueOf(int points) => Math.Round(points * PointValue, 2, MidpointRounding.AwayFromZero);
}
