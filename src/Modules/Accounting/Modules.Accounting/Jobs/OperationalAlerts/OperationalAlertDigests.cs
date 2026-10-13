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
    public const string PayablesLink = "/dashboard/reports/accounting/receivables?view=payables-due";
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

    /// <summary>
    /// The overdue rule for one open bill or customer debt. With a due date it is overdue once past it (real
    /// payment terms); without one (a supplier/customer with no credit days) the old proxy applies: it is overdue
    /// when older than <paramref name="overdueDays"/> (the <c>alerts.overdue_days</c> setting).
    /// </summary>
    public static bool IsOverdue(int? daysOverdue, int ageDays, int overdueDays) =>
        daysOverdue is { } days ? days > 0 : ageDays > overdueDays;

    /// <summary>Suppliers with bills past their due date (or, for bills without one, older than
    /// <paramref name="overdueDays"/>) still unpaid.</summary>
    public static OperationalAlertDigest? PayablesOverdue(IEnumerable<PayableDueBillDto> bills, int overdueDays)
    {
        ArgumentNullException.ThrowIfNull(bills);
        var items = bills
            .Where(b => b.Outstanding > 0m && IsOverdue(b.DaysOverdue, b.AgeDays, overdueDays))
            .GroupBy(b => b.SupplierId)
            .Select(g => (SupplierId: g.Key, g.First().SupplierName, Overdue: g.Sum(b => b.Outstanding)))
            .OrderByDescending(x => x.Overdue)
            .ToList();
        if (items.Count == 0)
        {
            return null;
        }

        decimal total = items.Sum(x => x.Overdue);
        string title = string.Create(
            CultureInfo.InvariantCulture,
            $"Rs {Money(total)} of supplier bills overdue");
        string body = $"{Plural(items.Count, "supplier is", "suppliers are")} waiting: " +
            Name(items.Select(x => $"{x.SupplierName} (Rs {Money(x.Overdue)})"), items.Count);

        return new OperationalAlertDigest(
            OperationalAlertCategories.PayablesOverdue, title, body, PayablesLink, items.Count,
            Signature(items.Select(x => x.SupplierId)));
    }

    /// <summary>Customers with dues past their due date (or, for dues without one, older than
    /// <paramref name="overdueDays"/>).</summary>
    public static OperationalAlertDigest? ReceivablesOverdue(IEnumerable<ReceivableDueInvoiceDto> invoices, int overdueDays)
    {
        ArgumentNullException.ThrowIfNull(invoices);
        var items = invoices
            .Where(i => i.Outstanding > 0m && IsOverdue(i.DaysOverdue, i.AgeDays, overdueDays))
            .GroupBy(i => i.CustomerId)
            .Select(g => (CustomerId: g.Key, g.First().CustomerName, Overdue: g.Sum(i => i.Outstanding)))
            .OrderByDescending(x => x.Overdue)
            .ToList();
        if (items.Count == 0)
        {
            return null;
        }

        decimal total = items.Sum(x => x.Overdue);
        string title = string.Create(
            CultureInfo.InvariantCulture,
            $"Rs {Money(total)} of customer dues overdue");
        string body = $"{Plural(items.Count, "customer owes", "customers owe")} overdue amounts: " +
            Name(items.Select(x => $"{x.CustomerName} (Rs {Money(x.Overdue)})"), items.Count);

        return new OperationalAlertDigest(
            OperationalAlertCategories.ReceivablesOverdue, title, body, ReceivablesLink, items.Count,
            Signature(items.Select(x => x.CustomerId)));
    }

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
