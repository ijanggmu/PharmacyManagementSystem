using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Reference.Contracts.Authorization;

public static class ReferencePermissions
{
    public static class Categories
    {
        public const string Resource = "Reference.Categories";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Update = $"Permissions.{Resource}.Update";
        public const string Delete = $"Permissions.{Resource}.Delete";
        public const string Restore = $"Permissions.{Resource}.Restore";
    }

    public static class Settings
    {
        public const string Resource = "Reference.Settings";
        public const string View = $"Permissions.{Resource}.View";
        public const string Update = $"Permissions.{Resource}.Update";
    }

    public static class Dashboard
    {
        public const string Resource = "Reference.Dashboard";
        public const string View = $"Permissions.{Resource}.View";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Medicine Categories", ActionConstants.View, Categories.Resource, IsBasic: true),
        new("Create Medicine Categories", ActionConstants.Create, Categories.Resource),
        new("Update Medicine Categories", ActionConstants.Update, Categories.Resource),
        new("Delete Medicine Categories", ActionConstants.Delete, Categories.Resource),
        new("Restore Medicine Categories", "Restore", Categories.Resource),

        new("View Pharmacy Settings", ActionConstants.View, Settings.Resource, IsBasic: true),
        new("Update Pharmacy Settings", ActionConstants.Update, Settings.Resource),

        // Basic: every authenticated tenant user loads their own dashboard bootstrap.
        new("View Dashboard Context", ActionConstants.View, Dashboard.Resource, IsBasic: true),
    ];
}
