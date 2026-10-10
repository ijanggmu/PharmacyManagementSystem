using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// One row per tenant (tenant isolation makes <c>TenantId</c> implicit — no explicit column
/// needed). Incremented atomically via a single <c>UPDATE ... RETURNING</c> statement
/// (<c>AccountingVoucherSequenceService</c>), which both locks and reads the new value in one
/// round trip — no separate <c>SELECT ... FOR UPDATE</c> step needed (root plan §5's
/// "posting-lock ordering" concern, solved without a second query).
/// </summary>
public sealed class AccountingVoucherSequence : AggregateRoot<Guid>
{
    public int LastNumber { get; private set; }

    private AccountingVoucherSequence() { }

    public static AccountingVoucherSequence CreateForTenant() => new()
    {
        Id = Guid.CreateVersion7(),
        LastNumber = 0,
    };
}
