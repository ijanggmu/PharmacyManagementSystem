using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Onboarding.Contracts.Authorization;

public static class OnboardingPermissions
{
    public static class Onboarding
    {
        public const string Resource = "Onboarding.Onboarding";
        public const string View = $"Permissions.{Resource}.View";
        public const string Complete = $"Permissions.{Resource}.Complete";
    }

    public static class Migration
    {
        public const string Resource = "Onboarding.Migration";
        public const string View = $"Permissions.{Resource}.View";
        public const string Manage = $"Permissions.{Resource}.Manage";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Onboarding Status", ActionConstants.View, Onboarding.Resource, IsBasic: true),
        new("Complete Onboarding", "Complete", Onboarding.Resource),
        new("View Migration Wizard", ActionConstants.View, Migration.Resource, IsBasic: true),
        new("Manage Migration Wizard", "Manage", Migration.Resource),
    ];
}
