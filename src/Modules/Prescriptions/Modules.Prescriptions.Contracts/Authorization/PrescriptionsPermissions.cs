using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Prescriptions.Contracts.Authorization;

public static class PrescriptionsPermissions
{
    public static class Prescriptions
    {
        public const string Resource = "Prescriptions.Prescriptions";
        public const string View = $"Permissions.{Resource}.View";
        public const string Create = $"Permissions.{Resource}.Create";
        public const string Cancel = $"Permissions.{Resource}.Cancel";
        public const string Update = $"Permissions.{Resource}.Update";
        public const string Delete = $"Permissions.{Resource}.Delete";
    }

    public static class Reports
    {
        public const string Resource = "Prescriptions.Reports";
        public const string View = $"Permissions.{Resource}.View";
    }

    /// <summary>Gates completing a sale that contains a controlled (scheduled/narcotic) medicine. Distinct
    /// from Sales.Create so a cashier cannot dispense a narcotic without a pharmacist/admin account.</summary>
    public static class ControlledSubstances
    {
        public const string Resource = "Prescriptions.ControlledSubstances";
        public const string Dispense = $"Permissions.{Resource}.Dispense";
    }

    /// <summary>Narrow, heavily-audited: most roles should never have it (root plan §5).</summary>
    public static class DispensingSafety
    {
        public const string Resource = "Prescriptions.DispensingSafety";
        public const string Override = $"Permissions.{Resource}.Override";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Prescriptions", ActionConstants.View, Prescriptions.Resource, IsBasic: true),
        new("Create Prescriptions", ActionConstants.Create, Prescriptions.Resource),
        new("Cancel Prescriptions", "Cancel", Prescriptions.Resource),
        new("Update Prescriptions", ActionConstants.Update, Prescriptions.Resource),
        new("Delete Prescriptions", ActionConstants.Delete, Prescriptions.Resource),

        new("View Prescription Reports", ActionConstants.View, Reports.Resource, IsBasic: true),

        new("Override Dispensing Safety", "Override", DispensingSafety.Resource),

        new("Dispense Controlled Substances", "Dispense", ControlledSubstances.Resource),
    ];
}
