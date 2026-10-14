using System.Net;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Purchasing.Domain;

/// <summary>
/// Discount, free-goods and pack terms of one purchase line, as entered on the supplier's bill. Quantities and
/// pack values are already in BASE units here (the handler converts packs before the aggregate sees the line):
/// <see cref="FreeQuantity"/> is the bonus stock received at no charge (the "1" of a 10+1 scheme),
/// <see cref="DiscountPercent"/>/<see cref="DiscountAmount"/> the line's trade discount (a positive amount wins
/// over the percent), and <see cref="PackSize"/>/<see cref="PackUnitCost"/> the pack the line was entered in
/// (units per pack and the rate per pack), kept so the line's gross is exactly packs × pack rate.
/// </summary>
public sealed record PurchaseLineTerms(
    decimal FreeQuantity = 0m,
    decimal DiscountPercent = 0m,
    decimal DiscountAmount = 0m,
    decimal? PackSize = null,
    decimal? PackUnitCost = null)
{
    public static readonly PurchaseLineTerms None = new();
}

/// <summary>
/// The money rules of a purchase bill, shared by purchase orders and direct goods receipts (and mirrored by the
/// web app's live totals). Every amount is rounded to 2 dp, half away from zero.
/// <list type="bullet">
/// <item>gross = quantity × rate (packs × pack rate when entered in packs)</item>
/// <item>line discount = the amount entered, else gross × percent / 100</item>
/// <item>bill discount = the amount entered, else Σ(gross − line discount) × percent / 100, spread over the lines
/// in proportion to each line's (gross − line discount), in whole paisa (see <see cref="Allocate"/>)</item>
/// <item>taxable (net) = gross − line discount − allocated bill discount — VAT is charged on this (IRD: VAT on the
/// discounted value) and the payable is net + VAT</item>
/// <item>effective unit cost = net / (quantity + free quantity): the cost of every unit put into stock, free ones
/// included</item>
/// </list>
/// </summary>
public static class PurchaseLineMath
{
    public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    public static decimal Gross(decimal quantity, decimal unitCostPrice, decimal? packSize, decimal? packUnitCost) =>
        packSize is > 0m && packUnitCost is { } packRate
            ? Round(quantity / packSize.Value * packRate)
            : Round(quantity * unitCostPrice);

    /// <summary>The line's trade discount: a positive amount as entered, otherwise the percent of the gross.</summary>
    public static decimal LineDiscount(decimal gross, decimal discountPercent, decimal discountAmount) =>
        AmountOrPercent(gross, discountPercent, discountAmount);

    /// <summary>The bill discount: a positive amount as entered, otherwise the percent of the lines' discounted total.</summary>
    public static decimal BillDiscount(decimal discountedTotal, decimal discountPercent, decimal discountAmount) =>
        AmountOrPercent(discountedTotal, discountPercent, discountAmount);

    private static decimal AmountOrPercent(decimal baseAmount, decimal percent, decimal amount)
    {
        if (amount > 0m)
        {
            return Round(amount);
        }

        return percent > 0m ? Round(baseAmount * percent / 100m) : 0m;
    }

    /// <summary>
    /// Spreads <paramref name="billDiscount"/> over lines in proportion to their discounted value (gross − line
    /// discount), in whole paisa by the largest-remainder method: each line first gets its share rounded down, then
    /// the paisa left over go one each to the lines with the largest remainders (ties: the larger line, then the
    /// earlier one). The shares always add back to the bill discount exactly, none is negative and none exceeds its
    /// line's value. Lines with no positive value get nothing.
    /// </summary>
    public static decimal[] Allocate(IReadOnlyList<decimal> lineValues, decimal billDiscount)
    {
        ArgumentNullException.ThrowIfNull(lineValues);

        var shares = new decimal[lineValues.Count];
        decimal[] values = lineValues.Select(v => v > 0m ? Math.Round(v * 100m, 0, MidpointRounding.AwayFromZero) : 0m).ToArray();
        decimal total = values.Sum();
        decimal discount = Math.Round(billDiscount * 100m, 0, MidpointRounding.AwayFromZero);
        if (discount <= 0m || total <= 0m)
        {
            return shares;
        }

        var remainders = new decimal[values.Length];
        decimal allocated = 0m;
        for (int i = 0; i < values.Length; i++)
        {
            decimal exact = discount * values[i];
            decimal floor = Math.Floor(exact / total);
            shares[i] = floor;
            remainders[i] = exact - (floor * total);
            allocated += floor;
        }

        var order = Enumerable.Range(0, values.Length)
            .Where(i => values[i] > 0m)
            .OrderByDescending(i => remainders[i])
            .ThenByDescending(i => values[i])
            .ThenBy(i => i)
            .ToList();
        for (int k = 0; allocated < discount && k < order.Count; k++, allocated++)
        {
            shares[order[k]] += 1m;
        }

        for (int i = 0; i < shares.Length; i++)
        {
            shares[i] /= 100m;
        }

        return shares;
    }

    /// <summary>Cost of each unit received (paid + free), to 4 decimal places so the lot's value (units × cost) stays
    /// within a fraction of a paisa of the net the books record; 0 when nothing is received.</summary>
    public static decimal EffectiveUnitCost(decimal netAmount, decimal quantity, decimal freeQuantity)
    {
        decimal units = quantity + freeQuantity;
        return units > 0m ? decimal.Round(netAmount / units, 4, MidpointRounding.AwayFromZero) : 0m;
    }

    /// <summary>Checks a line's terms against its gross; returns the resolved line discount amount.</summary>
    internal static decimal ValidateTerms(decimal gross, PurchaseLineTerms terms)
    {
        if (terms.FreeQuantity < 0m)
        {
            throw BadRequest("Free quantity cannot be negative.");
        }

        if (terms.DiscountPercent is < 0m or > 100m)
        {
            throw BadRequest("Line discount must be between 0 and 100 percent.");
        }

        if (terms.DiscountAmount < 0m)
        {
            throw BadRequest("Line discount amount cannot be negative.");
        }

        if (terms.PackSize is { } packSize && packSize <= 0m)
        {
            throw BadRequest("Units per pack must be positive.");
        }

        if (terms.PackUnitCost is < 0m)
        {
            throw BadRequest("Pack rate cannot be negative.");
        }

        decimal discount = LineDiscount(gross, terms.DiscountPercent, terms.DiscountAmount);
        if (discount > gross)
        {
            throw BadRequest("Line discount cannot be more than the line amount.");
        }

        return discount;
    }

    internal static void ValidateBillDiscount(decimal billDiscountPercent, decimal billDiscount, decimal discountedTotal)
    {
        if (billDiscountPercent is < 0m or > 100m)
        {
            throw BadRequest("Bill discount must be between 0 and 100 percent.");
        }

        if (billDiscount < 0m)
        {
            throw BadRequest("Bill discount cannot be negative.");
        }

        if (billDiscount > discountedTotal)
        {
            throw BadRequest("Bill discount cannot be more than the bill amount.");
        }
    }

    internal static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}
