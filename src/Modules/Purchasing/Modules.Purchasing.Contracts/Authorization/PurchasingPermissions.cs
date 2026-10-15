using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Purchasing.Contracts.Authorization;

public static class PurchasingPermissions
{
    public static class PurchaseOrders
    {
        public const string Resource = "Purchasing.PurchaseOrders";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Approve = $"Permissions.{Resource}.Approve";
        public const string Receive = $"Permissions.{Resource}.Receive";
        public const string Cancel = $"Permissions.{Resource}.Cancel";
    }

    public static class DirectGoodsReceipts
    {
        public const string Resource = "Purchasing.DirectGoodsReceipts";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Void = $"Permissions.{Resource}.Void";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Purchase Orders", ActionConstants.View, PurchaseOrders.Resource),
        new("Create Purchase Orders", ActionConstants.Create, PurchaseOrders.Resource),
        new("Approve Purchase Orders", "Approve", PurchaseOrders.Resource),
        new("Receive Purchase Orders", "Receive", PurchaseOrders.Resource),
        new("Cancel Purchase Orders", "Cancel", PurchaseOrders.Resource),
        new("View Direct Goods Receipts", ActionConstants.View, DirectGoodsReceipts.Resource),
        new("Create Direct Goods Receipts", ActionConstants.Create, DirectGoodsReceipts.Resource),
        new("Void Direct Goods Receipts", "Void", DirectGoodsReceipts.Resource),
    ];
}
