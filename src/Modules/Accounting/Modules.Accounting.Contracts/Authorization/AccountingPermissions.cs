using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Accounting.Contracts.Authorization;

public static class AccountingPermissions
{
    public static class Accounts
    {
        public const string Resource = "Accounting.Accounts";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Update = $"Permissions.{Resource}.Update";
        public const string Activate = $"Permissions.{Resource}.Activate";
        public const string Deactivate = $"Permissions.{Resource}.Deactivate";
    }

    public static class Vouchers
    {
        public const string Resource = "Accounting.Vouchers";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Update = $"Permissions.{Resource}.Update";
        public const string Delete = $"Permissions.{Resource}.Delete";
        public const string Post = $"Permissions.{Resource}.Post";
        public const string Void = $"Permissions.{Resource}.Void";
        public const string Reverse = $"Permissions.{Resource}.Reverse";
    }

    /// <summary>
    /// Opening balances (go-live trial balance). Deliberately registered under the existing
    /// <see cref="Vouchers"/> resource: the Identity module's token allowlist keeps permission claims by
    /// resource, so a new action on an allowed resource reaches the frontend without an Identity change.
    /// Viewing reuses <see cref="Vouchers.View"/> (accounting read); setting, editing and resetting need
    /// the dedicated <see cref="Manage"/> action, which only Admin holds by default.
    /// </summary>
    public static class OpeningBalances
    {
        public const string View = Vouchers.View;
        public const string Manage = $"Permissions.{Vouchers.Resource}.ManageOpeningBalances";
    }

    public static class Reports
    {
        public const string Resource = "Accounting.Reports";
        public const string View = $"Permissions.{Resource}.View";
    }

    public static class PostingLock
    {
        public const string Resource = "Accounting.PostingLock";
        public const string View = $"Permissions.{Resource}.View";
        public const string Update = $"Permissions.{Resource}.Update";
    }

    public static class Banking
    {
        public const string Resource = "Accounting.Banking";
        public const string View = $"Permissions.{Resource}.View";
        public const string RecordDeposit = $"Permissions.{Resource}.RecordDeposit";
        public const string Reconcile = $"Permissions.{Resource}.Reconcile";
    }

    public static class Expenses
    {
        public const string Resource = "Accounting.Expenses";
        public const string View = $"Permissions.{Resource}.View";
        public const string Record = $"Permissions.{Resource}.Record";
        public const string Update = $"Permissions.{Resource}.Update";
        public const string Delete = $"Permissions.{Resource}.Delete";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Accounts", ActionConstants.View, Accounts.Resource, IsBasic: true),
        new("Create Accounts", ActionConstants.Create, Accounts.Resource),
        new("Update Accounts", ActionConstants.Update, Accounts.Resource),
        new("Activate Accounts", "Activate", Accounts.Resource),
        new("Deactivate Accounts", "Deactivate", Accounts.Resource),

        new("View Vouchers", ActionConstants.View, Vouchers.Resource, IsBasic: true),
        new("Create Vouchers", ActionConstants.Create, Vouchers.Resource),
        new("Update Vouchers", ActionConstants.Update, Vouchers.Resource),
        new("Delete Vouchers", ActionConstants.Delete, Vouchers.Resource),
        new("Post Vouchers", "Post", Vouchers.Resource),
        new("Void Vouchers", "Void", Vouchers.Resource),
        new("Reverse Vouchers", "Reverse", Vouchers.Resource),
        new("Manage Opening Balances", "ManageOpeningBalances", Vouchers.Resource),

        new("View Accounting Reports", ActionConstants.View, Reports.Resource, IsBasic: true),

        new("View Banking", ActionConstants.View, Banking.Resource, IsBasic: true),
        new("Record Bank Deposit", "RecordDeposit", Banking.Resource),
        new("Reconcile Bank Account", "Reconcile", Banking.Resource),

        new("View Expenses", ActionConstants.View, Expenses.Resource, IsBasic: true),
        new("Record Expense", "Record", Expenses.Resource),
        new("Update Expense", ActionConstants.Update, Expenses.Resource),
        new("Delete Expense", ActionConstants.Delete, Expenses.Resource),

        new("View Posting Lock", ActionConstants.View, PostingLock.Resource, IsBasic: true),
        new("Update Posting Lock", ActionConstants.Update, PostingLock.Resource),
    ];
}
