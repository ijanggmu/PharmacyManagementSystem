using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// One counter row per (tenant, <see cref="Series"/>) — tenant isolation makes <c>TenantId</c> implicit.
/// Incremented atomically by a single upsert (<c>AccountingVoucherSequenceService</c>), which both locks and
/// reads the new value in one round trip. Rows are created on first use of a series.
/// <para>The row with an empty <see cref="Series"/> is the legacy shared counter that numbered every voucher
/// before type-wise series existed. It is never incremented again; a new series row starts after its
/// <see cref="LastNumber"/>, so no new voucher number can repeat a legacy one.</para>
/// </summary>
public sealed class AccountingVoucherSequence : AggregateRoot<Guid>
{
    /// <summary>The series code that keys the legacy shared counter.</summary>
    public const string LegacySeries = "";

    public string Series { get; private set; } = LegacySeries;

    public int LastNumber { get; private set; }

    private AccountingVoucherSequence() { }

    /// <summary>A fresh counter for <paramref name="series"/>. Production code never calls this (the upsert in
    /// <c>AccountingVoucherSequenceService</c> creates rows); it exists for tests and tooling.</summary>
    public static AccountingVoucherSequence Create(string series, int lastNumber = 0)
    {
        ArgumentNullException.ThrowIfNull(series);
        ArgumentOutOfRangeException.ThrowIfNegative(lastNumber);
        return new()
        {
            Id = Guid.CreateVersion7(),
            Series = series,
            LastNumber = lastNumber,
        };
    }
}
