using FSH.Modules.Inventory.Domain;

namespace FSH.Modules.Inventory.Features.v1.Transactions.SearchInventoryTransactions;

/// <summary>
/// Parses the <c>transactionType</c> filter of GET /inventory/transactions. Accepts the
/// <see cref="InventoryTransactionType"/> names (any casing) and the movement-history page's legacy
/// values: <c>expired</c> (an expiry write-off, stored as <see cref="InventoryTransactionType.Dispose"/>),
/// <c>return</c> (<see cref="InventoryTransactionType.SaleReversal"/>), <c>supplier_return</c> and
/// <c>recall</c>. Numeric strings are rejected so an out-of-range number can't match nothing silently.
/// </summary>
public static class InventoryTransactionTypeFilter
{
    private static readonly Dictionary<string, InventoryTransactionType> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["expired"] = InventoryTransactionType.Dispose,
        ["write_off"] = InventoryTransactionType.Dispose,
        ["return"] = InventoryTransactionType.SaleReversal,
        ["sale_reversal"] = InventoryTransactionType.SaleReversal,
        ["supplier_return"] = InventoryTransactionType.SupplierReturn,
    };

    public static bool TryParse(string? value, out InventoryTransactionType type)
    {
        type = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        string trimmed = value.Trim();
        if (Aliases.TryGetValue(trimmed, out type))
        {
            return true;
        }

        return !trimmed.All(char.IsAsciiDigit)
            && !trimmed.StartsWith('-')
            && Enum.TryParse(trimmed, ignoreCase: true, out type)
            && Enum.IsDefined(type);
    }
}
