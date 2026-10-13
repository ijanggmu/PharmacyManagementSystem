using FSH.Modules.Sales.Contracts.Dtos;

namespace FSH.Modules.Sales.Features.v1.Reports.GetMedicineMargins;

/// <summary>One sold line, flattened with the VAT facts of its sale.</summary>
public sealed record MedicineMarginLine(
    Guid MedicineId,
    decimal Quantity,
    decimal LineTotal,
    decimal UnitCostPrice,
    bool IsTaxable,
    decimal? SaleVatAmount,
    decimal? SaleVatRatePercent);

/// <summary>Pure margin arithmetic for <see cref="GetMedicineMarginsQueryHandler"/>, kept apart so it is unit-testable.</summary>
public static class MedicineMarginCalculator
{
    /// <summary>Nepal's standard VAT rate, used when a VAT-bearing sale did not store its rate.</summary>
    public const decimal DefaultVatRatePercent = 13m;

    /// <summary>
    /// The line total without VAT. Shelf prices include VAT, so a taxable line on a sale that charged VAT carries
    /// VAT inside its total; an exempt line, or any line of a sale without VAT (an unregistered pharmacy), does not.
    /// </summary>
    public static decimal NetOfVat(MedicineMarginLine line)
    {
        ArgumentNullException.ThrowIfNull(line);
        if (!line.IsTaxable || line.SaleVatAmount is not > 0m)
        {
            return line.LineTotal;
        }

        decimal rate = line.SaleVatRatePercent is > 0m ? line.SaleVatRatePercent.Value : DefaultVatRatePercent;
        return line.LineTotal / (1m + (rate / 100m));
    }

    /// <summary>Groups the lines by medicine and returns the <paramref name="take"/> largest margins, best first.</summary>
    public static IReadOnlyList<MedicineMarginDto> Top(IEnumerable<MedicineMarginLine> lines, int take)
    {
        ArgumentNullException.ThrowIfNull(lines);
        if (take <= 0)
        {
            return [];
        }

        return lines
            .GroupBy(l => l.MedicineId)
            .Select(g =>
            {
                decimal netRevenue = Math.Round(g.Sum(NetOfVat), 2, MidpointRounding.AwayFromZero);
                decimal cost = Math.Round(g.Sum(l => l.Quantity * l.UnitCostPrice), 2, MidpointRounding.AwayFromZero);
                decimal margin = netRevenue - cost;
                decimal? marginPercent = netRevenue == 0m
                    ? null
                    : Math.Round(margin / netRevenue * 100m, 1, MidpointRounding.AwayFromZero);
                return new MedicineMarginDto(g.Key, g.Sum(l => l.Quantity), netRevenue, cost, margin, marginPercent);
            })
            .OrderByDescending(m => m.Margin)
            .ThenByDescending(m => m.NetRevenue)
            .ThenBy(m => m.MedicineId)
            .Take(take)
            .ToList();
    }
}
