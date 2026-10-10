using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

public enum AccountingAccountType
{
    Asset = 0,
    Liability = 1,
    Equity = 2,
    Revenue = 3,
    Expense = 4,
}

/// <summary>
/// Chart-of-accounts row. Never deleted — a posted <see cref="AccountingVoucherLine"/> references
/// it forever, so the only lifecycle transitions are Activate/Deactivate.
/// <para>
/// The chart is a tree: five system root heads (<see cref="CreateRootHead"/>, codes 1–5) hold
/// group and ledger accounts below them via <see cref="ParentId"/>. Only leaves (accounts without
/// children) take voucher lines — see <c>AccountingPostableAccounts</c>.
/// </para>
/// </summary>
public sealed class AccountingAccount : AggregateRoot<Guid>
{
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public AccountingAccountType AccountType { get; private set; }

    /// <summary>Parent group in the chart tree; <c>null</c> only for the five root heads.</summary>
    public Guid? ParentId { get; private set; }

    /// <summary>Seeded system accounts (see <c>AccountingDbInitializer</c>) — code is stable, relied on by other modules' account mapping.</summary>
    public bool IsSystem { get; private set; }
    public bool IsActive { get; private set; } = true;

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private AccountingAccount() { }

    /// <summary>Root head per account type: code = the type's digit (1 Assets … 5 Expenses), system, never postable.</summary>
    public static readonly IReadOnlyDictionary<AccountingAccountType, (string Code, string Name)> RootHeads =
        new Dictionary<AccountingAccountType, (string Code, string Name)>
        {
            [AccountingAccountType.Asset] = ("1", "Assets"),
            [AccountingAccountType.Liability] = ("2", "Liabilities"),
            [AccountingAccountType.Equity] = ("3", "Equity"),
            [AccountingAccountType.Revenue] = ("4", "Revenue"),
            [AccountingAccountType.Expense] = ("5", "Expenses"),
        };

    /// <summary>True for the five system root heads (no parent, single-digit system code).</summary>
    public bool IsRootHead => ParentId is null && IsSystem && Code.Length == 1;

    public static AccountingAccount CreateRootHead(AccountingAccountType accountType)
    {
        var (code, name) = RootHeads[accountType];
        return Create(code, name, accountType, isSystem: true);
    }

    public static AccountingAccount Create(
        string code, string name, AccountingAccountType accountType, bool isSystem = false, Guid? parentId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(code);
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        return new AccountingAccount
        {
            Id = Guid.CreateVersion7(),
            Code = code.Trim().ToUpperInvariant(),
            Name = name.Trim(),
            AccountType = accountType,
            IsSystem = isSystem,
            ParentId = parentId,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public void Rename(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        Name = name.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Re-parents the account under <paramref name="parent"/>, taking the parent's head (account type)
    /// and, for non-system accounts, the regenerated <paramref name="newCode"/>. System accounts keep
    /// their code and head — other modules' postings resolve them by code.
    /// </summary>
    public void MoveUnder(AccountingAccount parent, string? newCode)
    {
        ArgumentNullException.ThrowIfNull(parent);

        if (IsRootHead)
        {
            throw new InvalidOperationException($"Root head '{Code}' cannot be moved.");
        }

        if (parent.Id == Id)
        {
            throw new InvalidOperationException("An account cannot be its own parent.");
        }

        ChangeType(parent.AccountType);
        ParentId = parent.Id;

        if (!IsSystem && !string.IsNullOrWhiteSpace(newCode))
        {
            Code = newCode.Trim().ToUpperInvariant();
        }

        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Assigns a parent without other changes — used once to backfill pre-hierarchy rows under their root head.</summary>
    public void AttachToRoot(AccountingAccount rootHead)
    {
        ArgumentNullException.ThrowIfNull(rootHead);
        if (ParentId is not null || IsRootHead || rootHead.AccountType != AccountType)
        {
            return;
        }

        ParentId = rootHead.Id;
    }

    /// <summary>Gives a non-system account a regenerated code (its parent's code changed).</summary>
    public void Recode(string code)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(code);
        if (IsSystem)
        {
            return;
        }

        Code = code.Trim().ToUpperInvariant();
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Changes the head (account type). Reports reclassify the account's whole history, since balances
    /// are derived from its current type. System accounts keep their type — postings rely on it.
    /// </summary>
    public void ChangeType(AccountingAccountType accountType)
    {
        if (AccountType == accountType)
        {
            return;
        }

        if (IsSystem)
        {
            throw new InvalidOperationException($"System account '{Code}' cannot be moved to another head.");
        }

        AccountType = accountType;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Activate()
    {
        IsActive = true;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Deactivate()
    {
        if (IsSystem)
        {
            throw new InvalidOperationException($"System account '{Code}' cannot be deactivated.");
        }

        IsActive = false;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
