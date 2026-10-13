using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>Where an account's movement goes in the cash flow statement (indirect method).</summary>
public enum CashFlowActivity
{
    /// <summary>Balance sheet: a working-capital change. Revenue/expense: stays in net profit.</summary>
    Operating = 0,

    /// <summary>Fixed assets, investments — or a revenue/expense (e.g. interest received) moved out of profit.</summary>
    Investing = 1,

    /// <summary>Equity, loans, owner drawings — or a revenue/expense (e.g. interest paid) moved out of profit.</summary>
    Financing = 2,

    /// <summary>Non-cash item added back to profit: depreciation and amortisation expense, accumulated depreciation.</summary>
    NonCash = 3,
}

/// <summary>
/// A tenant's cash flow classification for one account (and, through the chart tree, the accounts beneath it
/// that have no tag of their own). Accounts without a tag anywhere up their tree use the built-in default
/// (<c>CashFlowClassifier</c>), so tenants that never touch the setting still get a sensible statement.
/// Cash and bank accounts (the 10xx block) are always cash and cannot be tagged.
/// </summary>
public sealed class AccountCashFlowTag : AggregateRoot<Guid>
{
    public Guid AccountId { get; private set; }
    public CashFlowActivity Activity { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }
    public string UpdatedBy { get; private set; } = default!;

    private AccountCashFlowTag() { }

    public static AccountCashFlowTag Create(Guid accountId, CashFlowActivity activity, string updatedBy)
    {
        if (accountId == Guid.Empty)
        {
            throw new ArgumentException("Account id must be a valid, non-empty account.", nameof(accountId));
        }

        var tag = new AccountCashFlowTag { Id = Guid.CreateVersion7(), AccountId = accountId };
        tag.Change(activity, updatedBy);
        return tag;
    }

    public void Change(CashFlowActivity activity, string updatedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(updatedBy);
        if (!Enum.IsDefined(activity))
        {
            throw new ArgumentOutOfRangeException(nameof(activity), activity, "Unknown cash flow activity.");
        }

        Activity = activity;
        UpdatedBy = updatedBy.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
