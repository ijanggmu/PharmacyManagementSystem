using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using FSH.Modules.Accounting.Contracts.Alerts;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.Dtos;

namespace FSH.Modules.Accounting.Jobs.OperationalAlerts;

/// <summary>One category's daily digest for one branch scope. <see cref="Signature"/> fingerprints the set of items.</summary>
public sealed record OperationalAlertDigest(
    string Category,
    string Title,
    string Body,
    string Link,
    int ItemCount,
    string Signature);

/// <summary>
/// Turns report rows into digests: applies the thresholds, picks the items worth naming and fingerprints the set.
/// Pure (no I/O), so the thresholds are unit-tested directly. Each builder returns null when nothing needs attention.
/// </summary>
public static class OperationalAlertDigests
{
    /// <summary>How many items a digest names before "and N more".</summary>
    public const int NamedItems = 5;

    public const string LowStockLink = "/dashboard/inventory?stockFilter=low";
    public const string ExpiringLink = "/dashboard/inventory?expiryFilter=expiring";
    public const string PayablesLink = "/dashboard/reports/accounting/payables";
    public const string ReceivablesLink = "/dashboard/reports/accounting/receivables";

    /// <summary>
    /// Medicines whose sellable stock is at or below their reorder level. A reorder level of 0 means "not
    /// tracked" (discontinued or made-to-order items) and is skipped — otherwise every such item would be listed
    /// every day.
    /// </summary>
    public static OperationalAlertDigest? LowStock(IEnumerable<ReorderSuggestionDto> rows)
    {
        ArgumentNullException.ThrowIfNull(rows);
        var items = rows
            .Where(r => r.ReorderLevel > 0m && r.TotalQuantityOnHand <= r.ReorderLevel)
            .OrderBy(r => r.TotalQuantityOnHand)
            .ThenBy(r => r.MedicineName, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (items.Count == 0)
        {
            return null;
        }

        int outOfStock = items.Count(r => r.TotalQuantityOnHand <= 0m);
        string title = Plural(items.Count, "medicine is", "medicines are") + " at or below the reorder level";
        string named = Name(items.Select(r => string.Create(
            CultureInfo.InvariantCulture,
            $"{r.MedicineName} ({Qty(r.TotalQuantityOnHand)} left, reorder at {Qty(r.ReorderLevel)})")), items.Count);
        string body = outOfStock > 0
            ? $"{Plural(outOfStock, "is", "are")} out of stock. {named}"
            : named;

        return new OperationalAlertDigest(
            OperationalAlertCategories.LowStock, title, body, LowStockLink, items.Count,
            Signature(items.Select(r => r.MedicineId)));
    }

    /// <summary>Batches still on hand that expire within <paramref name="withinDays"/> days (or already have).</summary>
    public static OperationalAlertDigest? ExpiringBatches(IEnumerable<ExpiringBatchDto> rows, int withinDays)
    {
        ArgumentNullException.ThrowIfNull(rows);
        var items = rows
            .Where(b => b.QuantityOnHand > 0m && b.DaysUntilExpiry <= withinDays)
            .OrderBy(b => b.DaysUntilExpiry)
            .ThenBy(b => b.MedicineName, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (items.Count == 0)
        {
            return null;
        }

        int expired = items.Count(b => b.DaysUntilExpiry < 0);
        string title = string.Create(
            CultureInfo.InvariantCulture,
            $"{Plural(items.Count, "batch expires", "batches expire")} within {withinDays} days");
        string named = Name(items.Select(b => string.Create(
            CultureInfo.InvariantCulture,
            $"{b.MedicineName} batch {b.BatchNo} ({ExpiryText(b.DaysUntilExpiry)}, {Qty(b.QuantityOnHand)} on hand)")), items.Count);
        string body = expired > 0
            ? $"{Plural(expired, "batch has", "batches have")} already expired — move them off the shelf. {named}"
            : named;

        return new OperationalAlertDigest(
            OperationalAlertCategories.ExpiringBatches, title, body, ExpiringLink, items.Count,
            Signature(items.Select(b => b.BatchId)));
    }

    /// <summary>Suppliers with bills older than <paramref name="overdueDays"/> (30/60/90) still unpaid.</summary>
    public static OperationalAlertDigest? PayablesOverdue(IEnumerable<ApAgingReportLineDto> rows, int overdueDays)
    {
        ArgumentNullException.ThrowIfNull(rows);
        var items = rows
            .Select(r => (r.SupplierId, r.SupplierName, Overdue: OverdueAmount(r.Days31To60, r.Days61To90, r.Over90, overdueDays)))
            .Where(x => x.Overdue > 0m)
            .OrderByDescending(x => x.Overdue)
            .ToList();
        if (items.Count == 0)
        {
            return null;
        }

        decimal total = items.Sum(x => x.Overdue);
        string title = string.Create(
            CultureInfo.InvariantCulture,
            $"Rs {Money(total)} of supplier bills unpaid for over {overdueDays} days");
        string body = $"{Plural(items.Count, "supplier is", "suppliers are")} waiting: " +
            Name(items.Select(x => $"{x.SupplierName} (Rs {Money(x.Overdue)})"), items.Count);

        return new OperationalAlertDigest(
            OperationalAlertCategories.PayablesOverdue, title, body, PayablesLink, items.Count,
            Signature(items.Select(x => x.SupplierId)));
    }

    /// <summary>Customers whose dues are older than <paramref name="overdueDays"/> (30/60/90).</summary>
    public static OperationalAlertDigest? ReceivablesOverdue(IEnumerable<ArAgingReportLineDto> rows, int overdueDays)
    {
        ArgumentNullException.ThrowIfNull(rows);
        var items = rows
            .Select(r => (r.CustomerId, r.CustomerName, Overdue: OverdueAmount(r.Days31To60, r.Days61To90, r.Over90, overdueDays)))
            .Where(x => x.Overdue > 0m)
            .OrderByDescending(x => x.Overdue)
            .ToList();
        if (items.Count == 0)
        {
            return null;
        }

        decimal total = items.Sum(x => x.Overdue);
        string title = string.Create(
            CultureInfo.InvariantCulture,
            $"Rs {Money(total)} of customer dues outstanding for over {overdueDays} days");
        string body = $"{Plural(items.Count, "customer owes", "customers owe")} overdue amounts: " +
            Name(items.Select(x => $"{x.CustomerName} (Rs {Money(x.Overdue)})"), items.Count);

        return new OperationalAlertDigest(
            OperationalAlertCategories.ReceivablesOverdue, title, body, ReceivablesLink, items.Count,
            Signature(items.Select(x => x.CustomerId)));
    }

    /// <summary>
    /// The part of an aging line older than <paramref name="overdueDays"/>: the aging buckets are 0–30, 31–60,
    /// 61–90 and 90+, so 30 → everything past the first bucket, 60 → the last two, 90 → only 90+.
    /// </summary>
    public static decimal OverdueAmount(decimal days31To60, decimal days61To90, decimal over90, int overdueDays) =>
        OperationalAlertSettings.SnapOverdueDays(overdueDays) switch
        {
            90 => over90,
            60 => days61To90 + over90,
            _ => days31To60 + days61To90 + over90,
        };

    /// <summary>Order-independent fingerprint of a set of ids (16 upper-case hex chars of SHA-256).</summary>
    public static string Signature(IEnumerable<Guid> ids)
    {
        ArgumentNullException.ThrowIfNull(ids);
        string joined = string.Join(',', ids.Distinct().Select(id => id.ToString("N")).OrderBy(s => s, StringComparer.Ordinal));
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(joined));
        return Convert.ToHexString(hash, 0, 8);
    }

    private static string Name(IEnumerable<string> labels, int total)
    {
        var named = labels.Take(NamedItems).ToList();
        string list = string.Join(", ", named);
        return total > named.Count
            ? string.Create(CultureInfo.InvariantCulture, $"{list} and {total - named.Count} more.")
            : list + ".";
    }

    private static string Plural(int n, string one, string many) =>
        string.Create(CultureInfo.InvariantCulture, $"{n} {(n == 1 ? one : many)}");

    private static string Qty(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static string Money(decimal value) => value.ToString("#,##0", CultureInfo.InvariantCulture);

    private static string ExpiryText(int daysUntilExpiry) => daysUntilExpiry switch
    {
        < -1 => string.Create(CultureInfo.InvariantCulture, $"expired {-daysUntilExpiry} days ago"),
        -1 => "expired yesterday",
        0 => "expires today",
        1 => "expires tomorrow",
        _ => string.Create(CultureInfo.InvariantCulture, $"expires in {daysUntilExpiry} days"),
    };
}
