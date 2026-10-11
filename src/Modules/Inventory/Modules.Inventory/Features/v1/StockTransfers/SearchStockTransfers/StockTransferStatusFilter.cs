using FSH.Modules.Inventory.Domain;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.SearchStockTransfers;

/// <summary>
/// Parses the <c>status</c> filter of GET /inventory/stock-transfers: the
/// <see cref="StockTransferStatus"/> names in any casing, plus the snake_case values the web app uses
/// (<c>in_transit</c>, <c>completed</c>, <c>cancelled</c>). Numeric strings are rejected.
/// </summary>
public static class StockTransferStatusFilter
{
    public static bool TryParse(string? value, out StockTransferStatus status)
    {
        status = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        string normalized = value.Trim().Replace("_", string.Empty, StringComparison.Ordinal).Replace("-", string.Empty, StringComparison.Ordinal);
        return normalized.Length > 0
            && !normalized.All(char.IsAsciiDigit)
            && Enum.TryParse(normalized, ignoreCase: true, out status)
            && Enum.IsDefined(status);
    }
}
