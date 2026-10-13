using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// A tenant's choice of GL money account for one payment method (cash → a till account, eSewa → the
/// eSewa wallet account, bank → a specific bank …). One row per method per tenant; a method with no row
/// posts to its built-in default (<c>PaymentMethodAccounts.DefaultAccountCodeFor</c>), so tenants that never
/// touch the setting keep the original Cash 1000 / Bank 1010 / Insurance Receivable 1190 behaviour.
/// </summary>
public sealed class AccountingPaymentMethodAccount : AggregateRoot<Guid>
{
    public const int MethodMaxLength = 32;

    /// <summary>Normalized (lower-case) method key, e.g. <c>esewa</c> — the caller passes the canonical key.</summary>
    public string Method { get; private set; } = default!;

    public Guid AccountId { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }
    public string UpdatedBy { get; private set; } = default!;

    private AccountingPaymentMethodAccount() { }

    public static AccountingPaymentMethodAccount Create(string method, Guid accountId, string updatedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(method);
        var row = new AccountingPaymentMethodAccount
        {
            Id = Guid.CreateVersion7(),
            Method = method.Trim(),
        };
        row.Retarget(accountId, updatedBy);
        return row;
    }

    public void Retarget(Guid accountId, string updatedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(updatedBy);
        if (accountId == Guid.Empty)
        {
            throw new ArgumentException("Account id must be a valid, non-empty account.", nameof(accountId));
        }

        AccountId = accountId;
        UpdatedBy = updatedBy.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
