using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Multitenancy.Contracts.Authorization;

public static class MultitenancyPermissions
{
    public static class Tenants
    {
        public const string Resource = nameof(Tenants);
        public const string View                = $"Permissions.{Resource}.View";
        public const string Create              = $"Permissions.{Resource}.Create";
        public const string Update              = $"Permissions.{Resource}.Update";
        public const string UpgradeSubscription = $"Permissions.{Resource}.UpgradeSubscription";
        public const string ViewTheme           = $"Permissions.{Resource}.ViewTheme";
        public const string UpdateTheme         = $"Permissions.{Resource}.UpdateTheme";
    }

    public static class Branches
    {
        public const string Resource = nameof(Branches);
        public const string View   = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Update = $"Permissions.{Resource}.Update";
        public const string Switch = $"Permissions.{Resource}.Switch";
        /// <summary>Create, update and deactivate branches (Create/Update remain for existing grants).</summary>
        public const string Manage = $"Permissions.{Resource}.Manage";
        public const string ViewAll = $"Permissions.{Resource}.ViewAll";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Tenants",               ActionConstants.View,                Tenants.Resource, IsRoot: true),
        new("Create Tenants",             ActionConstants.Create,              Tenants.Resource, IsRoot: true),
        new("Update Tenants",             ActionConstants.Update,              Tenants.Resource, IsRoot: true),
        new("Upgrade Tenant Subscription",ActionConstants.UpgradeSubscription, Tenants.Resource, IsRoot: true),
        new("View Tenant Theme",          "ViewTheme",                         Tenants.Resource, IsBasic: true),
        new("Update Tenant Theme",        "UpdateTheme",                       Tenants.Resource),

        // Branches are tenant-owned business data (not root-gated): every tenant user can view
        // branches and switch their own current branch; only tenant admins can create/update them.
        new("View Branches",              ActionConstants.View,                Branches.Resource, IsBasic: true),
        new("Create Branches",            ActionConstants.Create,              Branches.Resource),
        new("Update Branches",            ActionConstants.Update,              Branches.Resource),
        new("Switch Branch",              "Switch",                            Branches.Resource, IsBasic: true),
        new("Manage Branches",            "Manage",                            Branches.Resource),

        // Holders see every branch in list queries when no branchId is passed. Not basic: only roles
        // explicitly granted it (Admin receives all non-root permissions) see across branches.
        new("View all branches",          "ViewAll",                           Branches.Resource),
    ];
}
