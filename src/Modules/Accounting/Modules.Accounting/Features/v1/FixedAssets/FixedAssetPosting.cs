using System.Globalization;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets;

/// <summary>One asset's charge in a depreciation voucher.</summary>
public sealed record DepreciationCharge(Guid AssetId, string AssetName, decimal Amount);

/// <summary>
/// The voucher lines of the fixed asset flows (pure, so the tests can check every one balances):
/// <list type="bullet">
/// <item>Acquisition (paid now / on credit): Dr Fixed Assets (cost) + Dr Input VAT Recoverable (VAT) / Cr the money
/// account or Accounts Payable (cost + VAT).</item>
/// <item>Opening: Dr Fixed Assets (cost) / Cr Accumulated Depreciation (depreciation to date) + Cr Owner's Equity (net
/// book value).</item>
/// <item>Depreciation: Dr Depreciation Expense (one line per asset) / Cr Accumulated Depreciation (total).</item>
/// <item>Disposal: Dr Accumulated Depreciation (to date) + Dr the money account (proceeds) + Dr Loss on Disposal / Cr Fixed
/// Assets (cost) + Cr Gain on Disposal.</item>
/// </list>
/// </summary>
public static class FixedAssetPosting
{
    public static IReadOnlyList<PostVoucherLine> AcquisitionLines(
        FixedAsset asset, Guid fixedAssetsAccountId, Guid? inputVatAccountId, Guid creditAccountId, string creditDescription)
    {
        ArgumentNullException.ThrowIfNull(asset);

        var lines = new List<PostVoucherLine>(3)
        {
            new(fixedAssetsAccountId, $"{asset.Category}: {asset.Name}", DebitAmount: asset.Cost, CreditAmount: 0m),
        };

        if (asset.VatAmount > 0m)
        {
            if (inputVatAccountId is not { } vatAccountId)
            {
                throw new InvalidOperationException("An asset bought on a VAT bill needs the Input VAT Recoverable account.");
            }

            string vatLine = "Input VAT"
                + (asset.BillNumber is null ? string.Empty : " — bill " + asset.BillNumber)
                + (asset.SupplierVatNumber is null ? string.Empty : " (VAT no. " + asset.SupplierVatNumber + ")");
            lines.Add(new PostVoucherLine(vatAccountId, vatLine, DebitAmount: asset.VatAmount, CreditAmount: 0m));
        }

        lines.Add(new PostVoucherLine(creditAccountId, creditDescription, DebitAmount: 0m, CreditAmount: asset.Cost + asset.VatAmount));
        return lines;
    }

    public static IReadOnlyList<PostVoucherLine> OpeningLines(
        FixedAsset asset, Guid fixedAssetsAccountId, Guid accumulatedDepreciationAccountId, Guid equityAccountId)
    {
        ArgumentNullException.ThrowIfNull(asset);

        var lines = new List<PostVoucherLine>(3)
        {
            new(fixedAssetsAccountId, $"{asset.Category}: {asset.Name} (opening)", DebitAmount: asset.Cost, CreditAmount: 0m),
        };
        if (asset.OpeningAccumulatedDepreciation > 0m)
        {
            lines.Add(new PostVoucherLine(
                accumulatedDepreciationAccountId, "Depreciation to date", DebitAmount: 0m, CreditAmount: asset.OpeningAccumulatedDepreciation));
        }

        decimal netBookValue = asset.Cost - asset.OpeningAccumulatedDepreciation;
        if (netBookValue > 0m)
        {
            lines.Add(new PostVoucherLine(equityAccountId, "Opening balance — fixed asset", DebitAmount: 0m, CreditAmount: netBookValue));
        }

        return lines;
    }

    public static IReadOnlyList<PostVoucherLine> DepreciationLines(
        IReadOnlyCollection<DepreciationCharge> charges, Guid depreciationExpenseAccountId, Guid accumulatedDepreciationAccountId, string periodLabel)
    {
        ArgumentNullException.ThrowIfNull(charges);

        var lines = charges
            .Where(c => c.Amount > 0m)
            .OrderBy(c => c.AssetName, StringComparer.OrdinalIgnoreCase)
            .Select(c => new PostVoucherLine(depreciationExpenseAccountId, Truncate($"Depreciation — {c.AssetName}"), DebitAmount: c.Amount, CreditAmount: 0m))
            .ToList();
        decimal total = lines.Sum(l => l.DebitAmount);
        lines.Add(new PostVoucherLine(
            accumulatedDepreciationAccountId, Truncate($"Accumulated depreciation — {periodLabel}"), DebitAmount: 0m, CreditAmount: total));
        return lines;
    }

    /// <summary>Disposal lines for removing <paramref name="asset"/> with <paramref name="accumulated"/> depreciation to date
    /// and <paramref name="proceeds"/> received into <paramref name="moneyAccountId"/>.</summary>
    public static IReadOnlyList<PostVoucherLine> DisposalLines(
        FixedAsset asset, decimal accumulated, decimal proceeds, Guid fixedAssetsAccountId, Guid accumulatedDepreciationAccountId,
        Guid? moneyAccountId, Guid gainAccountId, Guid lossAccountId)
    {
        ArgumentNullException.ThrowIfNull(asset);

        decimal netBookValue = asset.Cost - accumulated;
        decimal gainLoss = proceeds - netBookValue;
        var lines = new List<PostVoucherLine>(4);
        if (accumulated > 0m)
        {
            lines.Add(new PostVoucherLine(accumulatedDepreciationAccountId, "Accumulated depreciation removed", DebitAmount: accumulated, CreditAmount: 0m));
        }

        if (proceeds > 0m)
        {
            if (moneyAccountId is not { } money)
            {
                throw new InvalidOperationException("Sale proceeds need the account they were received in.");
            }

            lines.Add(new PostVoucherLine(money, "Sale proceeds", DebitAmount: proceeds, CreditAmount: 0m));
        }

        if (gainLoss < 0m)
        {
            lines.Add(new PostVoucherLine(lossAccountId, "Loss on disposal", DebitAmount: -gainLoss, CreditAmount: 0m));
        }

        lines.Add(new PostVoucherLine(fixedAssetsAccountId, Truncate($"{asset.Category}: {asset.Name} disposed"), DebitAmount: 0m, CreditAmount: asset.Cost));
        if (gainLoss > 0m)
        {
            lines.Add(new PostVoucherLine(gainAccountId, "Gain on disposal", DebitAmount: 0m, CreditAmount: gainLoss));
        }

        return lines;
    }

    /// <summary>"Shrawan 2083" or "Shrawan–Ashadh 2083/84".</summary>
    public static string PeriodLabel(int fiscalYear, int fromMonth, int toMonth)
    {
        var from = new FiscalPeriod(fiscalYear, fromMonth);
        if (fromMonth == toMonth)
        {
            return from.Label;
        }

        var to = new FiscalPeriod(fiscalYear, toMonth);
        return string.Create(CultureInfo.InvariantCulture, $"{from.Label} – {to.Label}");
    }

    private static string Truncate(string text) => text.Length <= 500 ? text : text[..500];
}
