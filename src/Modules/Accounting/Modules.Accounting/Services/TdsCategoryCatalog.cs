using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The tenant's TDS categories: the stored rows (edited in Finance setup), plus any default from
/// <see cref="TdsCategoryDefaults"/> the tenant has no row for yet (its seed has not run since TDS was added).
/// </summary>
internal static class TdsCategoryCatalog
{
    public static async Task<List<TdsCategoryDto>> ListAsync(AccountingDbContext dbContext, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var stored = await dbContext.TdsCategories
            .AsNoTracking()
            .OrderBy(c => c.SortOrder)
            .ThenBy(c => c.Code)
            .Select(c => new TdsCategoryDto(c.Code, c.Name, c.RatePercent, c.IsActive, c.SortOrder))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var missing = TdsCategoryDefaults.All
            .Select((d, index) => new TdsCategoryDto(d.Code, d.Name, d.RatePercent, true, index))
            .Where(d => !stored.Exists(s => s.Code == d.Code));

        return stored.Concat(missing).OrderBy(c => c.SortOrder).ThenBy(c => c.Code, StringComparer.Ordinal).ToList();
    }

    /// <summary>
    /// Builds the TDS withheld on a document: the category (which must exist and be active), the rate
    /// (<paramref name="ratePercent"/>, else the category's) and the amount (<paramref name="tdsAmount"/>, else
    /// taxable × rate). Returns null when no category is given.
    /// </summary>
    public static async Task<TdsWithholding?> ResolveAsync(
        AccountingDbContext dbContext, string? categoryCode, decimal? ratePercent, decimal? tdsAmount, decimal taxableAmount,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        if (string.IsNullOrWhiteSpace(categoryCode))
        {
            if (tdsAmount is > 0m)
            {
                throw BadRequest("Choose the TDS category the tax was withheld under.");
            }

            return null;
        }

        string code = TdsCategory.NormalizeCode(categoryCode);
        var category = (await ListAsync(dbContext, cancellationToken).ConfigureAwait(false)).Find(c => c.Code == code)
            ?? throw BadRequest($"TDS category '{categoryCode.Trim()}' does not exist.");
        if (!category.IsActive)
        {
            throw BadRequest($"TDS category {category.Name} is inactive — choose another or reactivate it in Finance setup.");
        }

        decimal rate = ratePercent ?? category.RatePercent;
        if (rate is <= 0m or > 100m)
        {
            throw BadRequest("The TDS rate must be more than 0% and at most 100%.");
        }

        decimal amount = tdsAmount is { } explicitAmount
            ? Math.Round(explicitAmount, 2, MidpointRounding.AwayFromZero)
            : TdsWithholding.Compute(taxableAmount, rate);
        if (amount < 0m || amount > taxableAmount)
        {
            throw BadRequest("TDS can't be negative or more than the taxable amount (excluding VAT).");
        }

        return amount == 0m ? null : new TdsWithholding(category.Code, category.Name, rate, taxableAmount, amount);
    }

    private static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}
