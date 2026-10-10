using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Customers.Contracts.Authorization;

public static class CustomersPermissions
{
    public static class Customers
    {
        public const string Resource = "Customers.Customers";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Update = $"Permissions.{Resource}.Update";
        public const string Delete = $"Permissions.{Resource}.Delete";
        public const string Restore = $"Permissions.{Resource}.Restore";
    }

    public static class Ledger
    {
        public const string Resource = "Customers.Ledger";
        public const string View = $"Permissions.{Resource}.View";
        public const string RecordPayment = $"Permissions.{Resource}.RecordPayment";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Customers", ActionConstants.View, Customers.Resource, IsBasic: true),
        new("Create Customers", ActionConstants.Create, Customers.Resource),
        new("Update Customers", ActionConstants.Update, Customers.Resource),
        new("Delete Customers", ActionConstants.Delete, Customers.Resource),
        new("Restore Customers", "Restore", Customers.Resource),

        new("View Customer Ledger", ActionConstants.View, Ledger.Resource, IsBasic: true),
        new("Record Customer Payment", "RecordPayment", Ledger.Resource),
    ];
}
