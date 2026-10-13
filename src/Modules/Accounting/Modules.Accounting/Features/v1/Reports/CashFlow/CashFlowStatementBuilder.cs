using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.Reports.CashFlow;

/// <summary>
/// Builds the indirect-method cash flow statement from the period trial balance. Pure, so it is tested directly.
/// <para>
/// Every voucher balances, so over the period Σ(debit − credit) across all accounts is zero, and the change in cash
/// equals Σ(credit − debit) over every other account: net profit (revenue and expense) plus the change in each
/// balance-sheet account. Each non-cash account's (credit − debit) movement is placed in exactly one line, so the
/// sections add up to the change in cash by construction; the check line compares that with the ledger's actual
/// closing cash and only differs when the ledger itself does not balance.
/// </para>
/// <para>
/// Movement excludes year-end closing vouchers (they only move profit into Retained Earnings, and net profit is the
/// P&amp;L before the close) and opening-balance vouchers dated inside the period (they set up the opening position,
/// so they count in the opening cash instead of as cash flows).
/// </para>
/// <para>
/// Non-cash items: depreciation/amortisation expense (or any revenue/expense tagged NonCash) is added back. Its
/// counterpart — accumulated depreciation, or the asset account itself when depreciation is credited straight to
/// it — is a balance-sheet movement too; non-cash balance-sheet accounts plus the minus of the add-back form one
/// investing line ("non-cash charges booked to asset accounts"), which is zero when accumulated depreciation moved
/// by exactly the charge and otherwise carries disposals or direct write-downs. With no non-cash expense account,
/// the accumulated-depreciation movement itself is the add-back.
/// </para>
/// </summary>
internal static class CashFlowStatementBuilder
{
    public const string DepreciationKey = "depreciation";
    public const string ReclassifiedKey = "reclassified";
    public const string NonCashOffsetKey = "non_cash_offset";

    private const decimal Tolerance = 0.01m;

    public static CashFlowStatementDto Build(
        PeriodTrialBalanceDto trialBalance, IReadOnlyDictionary<Guid, CashFlowAccountClass> classes)
    {
        ArgumentNullException.ThrowIfNull(trialBalance);
        ArgumentNullException.ThrowIfNull(classes);

        decimal netProfit = 0m;
        decimal openingCash = 0m;
        decimal closingCash = 0m;
        var cashAccounts = new List<CashFlowCashAccountDto>();
        var plNonCash = new LineAccumulator();
        var reclassified = new LineAccumulator();
        var bsNonCash = new LineAccumulator();
        var workingCapital = new Dictionary<string, LineAccumulator>(StringComparer.Ordinal);
        var investing = new List<(string Code, CashFlowAccountAmountDto Amount)>();
        var financing = new List<(string Code, CashFlowAccountAmountDto Amount)>();

        foreach (var line in trialBalance.Lines)
        {
            if (!classes.TryGetValue(line.AccountId, out var cls))
            {
                continue;
            }

            // Dr − Cr inside the period, without opening-balance and year-end closing vouchers.
            decimal movement = (line.PeriodDebit - line.OpeningVoucherDebit - line.YearEndCloseVoucherDebit)
                - (line.PeriodCredit - line.OpeningVoucherCredit - line.YearEndCloseVoucherCredit);
            decimal cashEffect = -movement;

            if (cls.IsCash)
            {
                decimal opening = line.OpeningDebit - line.OpeningCredit + line.OpeningVoucherDebit - line.OpeningVoucherCredit;
                decimal closing = line.OpeningDebit + line.PeriodDebit - line.OpeningCredit - line.PeriodCredit;
                openingCash += opening;
                closingCash += closing;
                if (opening != 0m || closing != 0m || movement != 0m)
                {
                    cashAccounts.Add(new CashFlowCashAccountDto(line.AccountId, line.AccountCode, line.AccountName, opening, closing));
                }

                continue;
            }

            if (cashEffect == 0m)
            {
                continue;
            }

            var amount = new CashFlowAccountAmountDto(line.AccountId, line.AccountCode, line.AccountName, cashEffect);
            bool isProfitAndLoss = line.AccountType is nameof(AccountingAccountType.Revenue) or nameof(AccountingAccountType.Expense);
            if (isProfitAndLoss)
            {
                // Credit − debit of a revenue or expense account is its contribution to net profit.
                netProfit += cashEffect;
                var reversal = amount with { Amount = -cashEffect };
                switch (cls.Activity)
                {
                    case CashFlowActivity.NonCash:
                        plNonCash.Add(reversal);
                        break;
                    case CashFlowActivity.Investing:
                        reclassified.Add(reversal);
                        investing.Add((line.AccountCode, amount));
                        break;
                    case CashFlowActivity.Financing:
                        reclassified.Add(reversal);
                        financing.Add((line.AccountCode, amount));
                        break;
                    default:
                        break;
                }

                continue;
            }

            switch (cls.Activity)
            {
                case CashFlowActivity.NonCash:
                    bsNonCash.Add(amount);
                    break;
                case CashFlowActivity.Investing:
                    investing.Add((line.AccountCode, amount));
                    break;
                case CashFlowActivity.Financing:
                    financing.Add((line.AccountCode, amount));
                    break;
                default:
                    string key = cls.WorkingCapitalKey ?? CashFlowClassifier.OtherOperating;
                    if (!workingCapital.TryGetValue(key, out var acc))
                    {
                        acc = new LineAccumulator();
                        workingCapital[key] = acc;
                    }

                    acc.Add(amount);
                    break;
            }
        }

        var adjustments = new List<CashFlowLineDto>();
        var investingLines = investing
            .OrderBy(x => x.Code, StringComparer.Ordinal)
            .Select(x => new CashFlowLineDto($"account:{x.Code}", x.Amount.AccountName, x.Amount.Amount, [x.Amount]))
            .ToList();

        const string depreciationLabel = "Depreciation, amortisation and other non-cash items";
        if (plNonCash.Count > 0)
        {
            adjustments.Add(plNonCash.ToLine(DepreciationKey, depreciationLabel));
            decimal offset = bsNonCash.Total - plNonCash.Total;
            if (offset != 0m)
            {
                var offsetAccounts = bsNonCash.Accounts.ToList();
                offsetAccounts.AddRange(plNonCash.Accounts.Select(a => a with { Amount = -a.Amount }));
                investingLines.Add(new CashFlowLineDto(NonCashOffsetKey, "Non-cash charges booked to asset accounts", offset, offsetAccounts));
            }
        }
        else if (bsNonCash.Count > 0)
        {
            adjustments.Add(bsNonCash.ToLine(DepreciationKey, depreciationLabel));
        }

        if (reclassified.Count > 0)
        {
            adjustments.Add(reclassified.ToLine(ReclassifiedKey, "Income and expenses shown under investing or financing"));
        }

        var workingCapitalLines = CashFlowClassifier.WorkingCapitalLines
            .Where(l => l.Key != CashFlowClassifier.OtherOperating || workingCapital.ContainsKey(l.Key))
            .Select(l => workingCapital.TryGetValue(l.Key, out var acc)
                ? acc.ToLine(l.Key, l.Label)
                : new CashFlowLineDto(l.Key, l.Label, 0m, []))
            .ToList();

        var financingLines = financing
            .OrderBy(x => x.Code, StringComparer.Ordinal)
            .Select(x => new CashFlowLineDto($"account:{x.Code}", x.Amount.AccountName, x.Amount.Amount, [x.Amount]))
            .ToList();

        decimal operatingTotal = netProfit + adjustments.Sum(l => l.Amount) + workingCapitalLines.Sum(l => l.Amount);
        decimal investingTotal = investingLines.Sum(l => l.Amount);
        decimal financingTotal = financingLines.Sum(l => l.Amount);
        decimal netChange = operatingTotal + investingTotal + financingTotal;
        decimal difference = closingCash - (openingCash + netChange);

        return new CashFlowStatementDto(
            trialBalance.FromUtc,
            trialBalance.ToUtc,
            trialBalance.BranchId,
            netProfit,
            adjustments,
            workingCapitalLines,
            operatingTotal,
            investingLines,
            investingTotal,
            financingLines,
            financingTotal,
            netChange,
            openingCash,
            closingCash,
            difference,
            Math.Abs(difference) <= Tolerance,
            cashAccounts.OrderBy(a => a.AccountCode, StringComparer.Ordinal).ToList());
    }

    private sealed class LineAccumulator
    {
        private readonly List<CashFlowAccountAmountDto> _accounts = [];

        public IReadOnlyList<CashFlowAccountAmountDto> Accounts => _accounts;
        public int Count => _accounts.Count;
        public decimal Total => _accounts.Sum(a => a.Amount);

        public void Add(CashFlowAccountAmountDto amount) => _accounts.Add(amount);

        public CashFlowLineDto ToLine(string key, string label) =>
            new(key, label, Total, _accounts.OrderBy(a => a.AccountCode, StringComparer.Ordinal).ToList());
    }
}
