using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Inventory.Contracts.Authorization;

public static class InventoryPermissions
{
    public static class Medicines
    {
        public const string Resource = "Inventory.Medicines";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Update = $"Permissions.{Resource}.Update";
        public const string Delete = $"Permissions.{Resource}.Delete";
        public const string Restore = $"Permissions.{Resource}.Restore";
    }

    public static class Batches
    {
        public const string Resource = "Inventory.Batches";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string AdjustStock = $"Permissions.{Resource}.AdjustStock";
        public const string Dispose = $"Permissions.{Resource}.Dispose";
    }

    public static class Reports
    {
        public const string Resource = "Inventory.Reports";
        public const string View = $"Permissions.{Resource}.View";
    }

    public static class Consignment
    {
        public const string Resource = "Inventory.Consignment";
        public const string View = $"Permissions.{Resource}.View";
        public const string Receive = $"Permissions.{Resource}.Receive";
        public const string Settle = $"Permissions.{Resource}.Settle";
    }

    public static class StockTransfers
    {
        public const string Resource = "Inventory.StockTransfers";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Receive = $"Permissions.{Resource}.Receive";
        public const string Cancel = $"Permissions.{Resource}.Cancel";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Medicines", ActionConstants.View, Medicines.Resource, IsBasic: true),
        new("Create Medicines", ActionConstants.Create, Medicines.Resource),
        new("Update Medicines", ActionConstants.Update, Medicines.Resource),
        new("Delete Medicines", ActionConstants.Delete, Medicines.Resource),
        new("Restore Medicines", "Restore", Medicines.Resource),

        new("View Batches", ActionConstants.View, Batches.Resource, IsBasic: true),
        new("Create Batches", ActionConstants.Create, Batches.Resource),
        new("Adjust Stock", "AdjustStock", Batches.Resource),
        new("Dispose Batches", "Dispose", Batches.Resource),

        new("View Inventory Reports", ActionConstants.View, Reports.Resource, IsBasic: true),

        new("View Consignment", ActionConstants.View, Consignment.Resource, IsBasic: true),
        new("Receive Consignment Stock", "Receive", Consignment.Resource),
        new("Settle Consignment", "Settle", Consignment.Resource),

        new("View Stock Transfers", ActionConstants.View, StockTransfers.Resource, IsBasic: true),
        new("Create Stock Transfers", ActionConstants.Create, StockTransfers.Resource),
        new("Receive Stock Transfers", "Receive", StockTransfers.Resource),
        new("Cancel Stock Transfers", "Cancel", StockTransfers.Resource),
    ];
}
