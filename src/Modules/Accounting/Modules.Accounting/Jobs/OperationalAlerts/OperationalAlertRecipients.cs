using FSH.Modules.Accounting.Contracts.Alerts;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;

namespace FSH.Modules.Accounting.Jobs.OperationalAlerts;

/// <summary>
/// Who gets which alert. Each category needs the permission to SEE the underlying report plus one to ACT on it,
/// which the seeded roles grant to managers and admins only (cashiers, staff and pharmacists hold the view
/// permissions but not the action ones) — a daily digest is for the people who reorder stock and settle dues.
/// The branch side of "who can see it" is applied by the scan: each user's digest is built in their own branch scope.
/// </summary>
public static class OperationalAlertRecipients
{
    public static readonly IReadOnlyDictionary<string, string[]> RequiredPermissions = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        [OperationalAlertCategories.LowStock] = [InventoryPermissions.Reports.View, InventoryPermissions.Batches.AdjustStock],
        [OperationalAlertCategories.ExpiringBatches] = [InventoryPermissions.Reports.View, InventoryPermissions.Batches.AdjustStock],
        [OperationalAlertCategories.PayablesOverdue] = [AccountingPermissions.Reports.View, SuppliersPermissions.Ledger.RecordPayment],
        [OperationalAlertCategories.ReceivablesOverdue] = [AccountingPermissions.Reports.View, CustomersPermissions.Ledger.RecordPayment],
    };

    /// <summary>The categories a user holding <paramref name="permissions"/> should receive, in a stable order.</summary>
    public static IReadOnlyList<string> CategoriesFor(IEnumerable<string>? permissions)
    {
        if (permissions is null)
        {
            return [];
        }

        var held = permissions as IReadOnlySet<string> ?? new HashSet<string>(permissions, StringComparer.Ordinal);
        return OperationalAlertCategories.All
            .Where(category => RequiredPermissions[category].All(held.Contains))
            .ToList();
    }
}
