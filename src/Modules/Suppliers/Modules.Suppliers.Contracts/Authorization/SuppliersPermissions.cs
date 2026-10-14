using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Suppliers.Contracts.Authorization;

public static class SuppliersPermissions
{
    public static class Suppliers
    {
        public const string Resource = "Suppliers.Suppliers";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Update = $"Permissions.{Resource}.Update";
        public const string Delete = $"Permissions.{Resource}.Delete";
        public const string Restore = $"Permissions.{Resource}.Restore";
    }

    public static class Ledger
    {
        public const string Resource = "Suppliers.Ledger";
        public const string View = $"Permissions.{Resource}.View";
        public const string RecordPayment = $"Permissions.{Resource}.RecordPayment";

        /// <summary>Voiding a recorded payment (reverses its AP entry and GL voucher, reopens the bill it paid).
        /// Granted with the whole ledger resource (manager, admin), not to roles holding only <see cref="View"/>.</summary>
        public const string VoidPayment = $"Permissions.{Resource}.VoidPayment";

        /// <summary>Creating a supplier with a non-zero opening balance (it moves the AP ledger and the GL).
        /// Needed on top of <see cref="Suppliers.Create"/>.</summary>
        public const string ManageOpeningBalance = $"Permissions.{Resource}.OpeningBalance";
    }

    public static class Returns
    {
        public const string Resource = "Suppliers.Returns";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Suppliers", ActionConstants.View, Suppliers.Resource),
        new("Create Suppliers", ActionConstants.Create, Suppliers.Resource),
        new("Update Suppliers", ActionConstants.Update, Suppliers.Resource),
        new("Delete Suppliers", ActionConstants.Delete, Suppliers.Resource),
        new("Restore Suppliers", "Restore", Suppliers.Resource),

        new("View Supplier Ledger", ActionConstants.View, Ledger.Resource),
        new("Record Supplier Payment", "RecordPayment", Ledger.Resource),
        new("Void Supplier Payment", "VoidPayment", Ledger.Resource),
        new("Manage Supplier Opening Balances", "OpeningBalance", Ledger.Resource),

        new("View Supplier Returns", ActionConstants.View, Returns.Resource),
        new("Create Supplier Returns", ActionConstants.Create, Returns.Resource),
    ];
}
