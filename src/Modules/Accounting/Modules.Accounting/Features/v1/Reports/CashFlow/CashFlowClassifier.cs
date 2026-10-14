using System.Text.RegularExpressions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;

namespace FSH.Modules.Accounting.Features.v1.Reports.CashFlow;

/// <summary>The chart facts the cash flow classification needs.</summary>
internal sealed record CashFlowChartAccount(Guid Id, string Code, string Name, AccountingAccountType Type, Guid? ParentId, bool IsRootHead);

/// <summary>
/// An account's cash flow classification. <see cref="IsCash"/> accounts (the 10xx cash and bank block) are the cash
/// the statement explains; everything else has an <see cref="Activity"/>. <see cref="WorkingCapitalKey"/> is set
/// for operating balance-sheet accounts: the working-capital line their change goes to.
/// <see cref="IsDisposalResult"/> marks a gain or loss on disposal (or write-off) of fixed assets: a non-cash item in
/// operating whose amount belongs to the disposal proceeds under investing.
/// </summary>
internal sealed record CashFlowAccountClass(
    bool IsCash,
    CashFlowActivity Activity,
    CashFlowActivity DefaultActivity,
    CashFlowActivity? Tag,
    string? WorkingCapitalKey,
    bool IsDisposalResult = false);

/// <summary>
/// Classifies chart accounts for the cash flow statement: an account's own tag, else the nearest tagged ancestor's,
/// else a built-in default from its head and name (and its ancestors' names):
/// <list type="bullet">
/// <item>Asset 10xx — cash and bank (<see cref="CashBankAccounts"/>), never tagged.</item>
/// <item>"Accumulated depreciation/amortisation" (any head) and depreciation/amortisation expense — non-cash.</item>
/// <item>Assets named like fixed assets or investments (fixed asset, property, plant, equipment, furniture,
/// vehicle, building, land, machinery, computer, intangible, investment …) — investing; other assets operating.</item>
/// <item>Liabilities named like borrowings (loan, borrowing, debenture, bond, overdraft, lease liability, hire
/// purchase) — financing; other liabilities operating.</item>
/// <item>Equity (capital, drawings, retained earnings adjustments) — financing.</item>
/// <item>Gain / loss on disposal of fixed assets (the system 4950 / 5950 accounts, or a revenue/expense account named
/// "gain/loss/profit on … disposal") — investing: removed from operating and counted in the disposal proceeds.</item>
/// <item>Other revenue and expense — operating (they make up net profit).</item>
/// </list>
/// </summary>
internal static partial class CashFlowClassifier
{
    public const string Receivables = "receivables";
    public const string Inventory = "inventory";
    public const string InputVat = "input_vat";
    public const string OtherCurrentAssets = "other_current_assets";
    public const string Payables = "payables";
    public const string VatPayable = "vat_payable";
    public const string TdsPayable = "tds_payable";
    public const string OtherCurrentLiabilities = "other_current_liabilities";
    public const string OtherOperating = "other_operating";

    /// <summary>Working-capital lines in statement order, with their labels (positive amount = cash in).</summary>
    public static readonly IReadOnlyList<(string Key, string Label)> WorkingCapitalLines =
    [
        (Receivables, "(Increase)/decrease in accounts receivable"),
        (Inventory, "(Increase)/decrease in inventory"),
        (InputVat, "(Increase)/decrease in input VAT recoverable"),
        (OtherCurrentAssets, "(Increase)/decrease in other current assets"),
        (Payables, "Increase/(decrease) in accounts payable"),
        (VatPayable, "Increase/(decrease) in VAT payable"),
        (TdsPayable, "Increase/(decrease) in TDS payable"),
        (OtherCurrentLiabilities, "Increase/(decrease) in other current liabilities"),
        (OtherOperating, "Other operating items"),
    ];

    /// <summary>System control accounts with a working-capital line of their own; sub-accounts beneath them share it.</summary>
    private static readonly IReadOnlyDictionary<string, string> ControlAccountLines = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [AccountingSystemAccountCodes.AccountsReceivable] = Receivables,
        [AccountingSystemAccountCodes.Inventory] = Inventory,
        [AccountingSystemAccountCodes.InputVatRecoverable] = InputVat,
        [AccountingSystemAccountCodes.AccountsPayable] = Payables,
        [AccountingSystemAccountCodes.VatPayable] = VatPayable,
        [AccountingSystemAccountCodes.TdsPayable] = TdsPayable,
    };

    [GeneratedRegex(@"accumulated\s+(depreciation|amorti[sz]ation)|\bacc(um)?\.?\s*dep", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex AccumulatedDepreciation();

    [GeneratedRegex(@"depreciation|amorti[sz]ation", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Depreciation();

    [GeneratedRegex(@"fixed\s+asset|property|plant|equipment|furniture|fixture|vehicle|building|\bland\b|machinery|computer|intangible|software|investment|capital\s+work|leasehold|goodwill", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex FixedAssetOrInvestment();

    [GeneratedRegex(@"\b(gain|loss|profit)\b[\w\s]*\bdisposal\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex DisposalResult();

    [GeneratedRegex(@"\bloans?\b|borrowing|debenture|\bbonds?\b|overdraft|lease\s+liabilit|hire\s+purchase", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Borrowing();

    /// <summary>True for the 10xx cash and bank block, the same rule as <see cref="CashBankAccounts"/>.</summary>
    public static bool IsCashAccount(CashFlowChartAccount account)
    {
        ArgumentNullException.ThrowIfNull(account);
        return account.Type == AccountingAccountType.Asset && account.Code.StartsWith(CashBankAccounts.CodePrefix, StringComparison.Ordinal);
    }

    /// <summary>True when the account may carry a tag: not a cash/bank account and not a root head.</summary>
    public static bool IsTaggable(CashFlowChartAccount account)
    {
        ArgumentNullException.ThrowIfNull(account);
        return !IsCashAccount(account) && !account.IsRootHead;
    }

    public static IReadOnlyDictionary<Guid, CashFlowAccountClass> Classify(
        IReadOnlyCollection<CashFlowChartAccount> accounts, IReadOnlyDictionary<Guid, CashFlowActivity> tags)
    {
        ArgumentNullException.ThrowIfNull(accounts);
        ArgumentNullException.ThrowIfNull(tags);

        var byId = accounts.ToDictionary(a => a.Id);
        var result = new Dictionary<Guid, CashFlowAccountClass>(accounts.Count);
        foreach (var account in accounts)
        {
            var chain = Chain(account, byId);
            if (IsCashAccount(account))
            {
                result[account.Id] = new CashFlowAccountClass(true, CashFlowActivity.Operating, CashFlowActivity.Operating, null, null);
                continue;
            }

            CashFlowActivity defaultActivity = DefaultActivity(account, chain);
            CashFlowActivity? ownTag = tags.TryGetValue(account.Id, out var t) ? t : null;
            CashFlowActivity? inherited = chain.Skip(1)
                .Select(a => tags.TryGetValue(a.Id, out var at) ? at : (CashFlowActivity?)null)
                .FirstOrDefault(x => x is not null);
            CashFlowActivity activity = ownTag ?? inherited ?? defaultActivity;

            string? workingCapitalKey = activity == CashFlowActivity.Operating && account.Type is not (AccountingAccountType.Revenue or AccountingAccountType.Expense)
                ? WorkingCapitalKey(account, chain)
                : null;
            bool isDisposalResult = activity == CashFlowActivity.Investing && IsDisposalResultAccount(account, chain);
            result[account.Id] = new CashFlowAccountClass(false, activity, defaultActivity, ownTag, workingCapitalKey, isDisposalResult);
        }

        return result;
    }

    /// <summary>The account itself, then its ancestors up to (not including) the root head.</summary>
    private static List<CashFlowChartAccount> Chain(CashFlowChartAccount account, Dictionary<Guid, CashFlowChartAccount> byId)
    {
        var chain = new List<CashFlowChartAccount>();
        var seen = new HashSet<Guid>();
        CashFlowChartAccount? current = account;
        while (current is not null && !current.IsRootHead && seen.Add(current.Id))
        {
            chain.Add(current);
            current = current.ParentId is { } parentId && byId.TryGetValue(parentId, out var parent) ? parent : null;
        }

        return chain;
    }

    private static CashFlowActivity DefaultActivity(CashFlowChartAccount account, List<CashFlowChartAccount> chain)
    {
        bool AnyName(Regex regex) => chain.Any(a => regex.IsMatch(a.Name));

        if (AnyName(AccumulatedDepreciation()))
        {
            return CashFlowActivity.NonCash;
        }

        if (IsDisposalResultAccount(account, chain))
        {
            return CashFlowActivity.Investing;
        }

        return account.Type switch
        {
            AccountingAccountType.Asset => AnyName(FixedAssetOrInvestment()) ? CashFlowActivity.Investing : CashFlowActivity.Operating,
            AccountingAccountType.Liability => AnyName(Borrowing()) ? CashFlowActivity.Financing : CashFlowActivity.Operating,
            AccountingAccountType.Equity => CashFlowActivity.Financing,
            AccountingAccountType.Expense => AnyName(Depreciation()) ? CashFlowActivity.NonCash : CashFlowActivity.Operating,
            _ => CashFlowActivity.Operating,
        };
    }

    /// <summary>A revenue or expense account holding gains or losses on disposing of fixed assets.</summary>
    private static bool IsDisposalResultAccount(CashFlowChartAccount account, List<CashFlowChartAccount> chain) =>
        account.Type is AccountingAccountType.Revenue or AccountingAccountType.Expense
        && chain.Any(a => a.Code is AccountingSystemAccountCodes.GainOnAssetDisposal or AccountingSystemAccountCodes.LossOnAssetDisposal
            || DisposalResult().IsMatch(a.Name));

    private static string WorkingCapitalKey(CashFlowChartAccount account, List<CashFlowChartAccount> chain)
    {
        foreach (var a in chain)
        {
            if (ControlAccountLines.TryGetValue(a.Code, out var key))
            {
                return key;
            }
        }

        return account.Type switch
        {
            AccountingAccountType.Asset => OtherCurrentAssets,
            AccountingAccountType.Liability => OtherCurrentLiabilities,
            _ => OtherOperating,
        };
    }
}
