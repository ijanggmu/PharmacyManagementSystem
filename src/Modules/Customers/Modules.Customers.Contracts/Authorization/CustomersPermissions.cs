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

        /// <summary>Voiding a recorded payment (reverses its AR entry and GL voucher). Granted with the whole
        /// ledger resource (manager, admin); roles holding only <see cref="View"/> (cashier, pharmacist) don't get it.</summary>
        public const string VoidPayment = $"Permissions.{Resource}.VoidPayment";
    }

    /// <summary>
    /// Setting or removing a customer's credit limit (how much they may owe on account). Declared on the
    /// <see cref="Ledger"/> resource on purpose: roles that hold every <c>Customers.Customers</c> action
    /// (cashier, pharmacist) must not get it implicitly, while roles granted the whole ledger
    /// (manager, admin) do — and the resource is already in the token permission allowlist.
    /// </summary>
    public static class Credit
    {
        public const string Manage = $"Permissions.{Ledger.Resource}.Credit";
    }

    /// <summary>Manual loyalty-point corrections (add/remove points with a reason). Same resource choice as <see cref="Credit"/>.</summary>
    public static class Loyalty
    {
        public const string Adjust = $"Permissions.{Ledger.Resource}.Loyalty";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Customers", ActionConstants.View, Customers.Resource),
        new("Create Customers", ActionConstants.Create, Customers.Resource),
        new("Update Customers", ActionConstants.Update, Customers.Resource),
        new("Delete Customers", ActionConstants.Delete, Customers.Resource),
        new("Restore Customers", "Restore", Customers.Resource),

        new("View Customer Ledger", ActionConstants.View, Ledger.Resource),
        new("Record Customer Payment", "RecordPayment", Ledger.Resource),
        new("Void Customer Payment", "VoidPayment", Ledger.Resource),
        new("Manage Customer Credit Limits", "Credit", Ledger.Resource),
        new("Adjust Customer Loyalty Points", "Loyalty", Ledger.Resource),
    ];
}
