using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Sales.Contracts.Authorization;

public static class SalesPermissions
{
    public static class Sales
    {
        public const string Resource = "Sales.Sales";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Cancel = $"Permissions.{Resource}.Cancel";

        /// <summary>Complete a credit sale that takes the customer past their credit limit.</summary>
        public const string OverrideCreditLimit = $"Permissions.{Resource}.OverrideCreditLimit";

        /// <summary>Sell at a cheaper price level than the customer's own (e.g. wholesale to a walk-in) without a
        /// manager approval.</summary>
        public const string OverridePriceLevel = $"Permissions.{Resource}.OverridePriceLevel";
    }

    /// <summary>Price levels (wholesale / custom) and which customers buy at them.</summary>
    public static class PriceLevels
    {
        public const string Resource = "Sales.PriceLevels";
        public const string Manage = $"Permissions.{Resource}.Manage";
    }

    public static class CashShifts
    {
        public const string Resource = "Sales.CashShifts";
        public const string View = $"Permissions.{Resource}.View";
        public const string Start = $"Permissions.{Resource}.Start";
        public const string Close = $"Permissions.{Resource}.Close";
    }

    public static class Returns
    {
        public const string Resource = "Sales.Returns";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Update = $"Permissions.{Resource}.Update";
    }

    public static class Refunds
    {
        public const string Resource = "Sales.Refunds";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Update = $"Permissions.{Resource}.Update";
    }

    public static class Reports
    {
        public const string Resource = "Sales.Reports";
        public const string View = $"Permissions.{Resource}.View";
    }

    public static class Ird
    {
        public const string Resource = "Sales.Ird";
        public const string View = $"Permissions.{Resource}.View";
        public const string Send = $"Permissions.{Resource}.Send";
        public const string Manage = $"Permissions.{Resource}.Manage";
    }

    public static class PaymentSettings
    {
        public const string Resource = "Sales.PaymentSettings";
        public const string Update = $"Permissions.{Resource}.Update";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Sales", ActionConstants.View, Sales.Resource, IsBasic: true),
        new("Create Sales", ActionConstants.Create, Sales.Resource),
        new("Cancel Sales", "Cancel", Sales.Resource),
        new("Override Customer Credit Limit", "OverrideCreditLimit", Sales.Resource),
        new("Override Price Level", "OverridePriceLevel", Sales.Resource),
        new("Manage Price Levels", "Manage", PriceLevels.Resource),
        new("View Cash Shifts", ActionConstants.View, CashShifts.Resource, IsBasic: true),
        new("Start Cash Shift", "Start", CashShifts.Resource),
        new("Close Cash Shift", "Close", CashShifts.Resource),
        new("View Returns", ActionConstants.View, Returns.Resource, IsBasic: true),
        new("Create Returns", ActionConstants.Create, Returns.Resource),
        new("Update Returns", ActionConstants.Update, Returns.Resource),
        new("View Refunds", ActionConstants.View, Refunds.Resource, IsBasic: true),
        new("Create Refunds", ActionConstants.Create, Refunds.Resource),
        new("Update Refunds", ActionConstants.Update, Refunds.Resource),
        new("View Sales Reports", ActionConstants.View, Reports.Resource, IsBasic: true),
        new("View IRD Queue", ActionConstants.View, Ird.Resource, IsBasic: true),
        new("Send IRD Invoice", "Send", Ird.Resource),
        new("Manage IRD E-Billing Settings", "Manage", Ird.Resource),
        new("Update Payment Settings", ActionConstants.Update, PaymentSettings.Resource),
    ];
}
