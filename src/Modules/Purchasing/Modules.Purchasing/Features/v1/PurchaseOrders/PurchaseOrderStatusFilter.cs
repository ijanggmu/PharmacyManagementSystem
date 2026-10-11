using FSH.Modules.Purchasing.Domain;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders;

/// <summary>Parses the comma-separated status filter of the purchase order search.</summary>
internal static class PurchaseOrderStatusFilter
{
    public static bool IsValid(string? value) => TryParse(value, out _);

    public static bool TryParse(string? value, out IReadOnlyList<PurchaseOrderStatus> statuses)
    {
        var parsed = new List<PurchaseOrderStatus>();
        statuses = parsed;
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        foreach (string part in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            // Names only: Enum.TryParse would also accept numbers such as "7".
            if (int.TryParse(part, out _)
                || !Enum.TryParse(part, ignoreCase: true, out PurchaseOrderStatus status)
                || !Enum.IsDefined(status))
            {
                return false;
            }

            if (!parsed.Contains(status))
            {
                parsed.Add(status);
            }
        }

        return true;
    }
}
