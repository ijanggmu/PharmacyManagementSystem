using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Identity.Data;

/// <summary>
/// Seed data transcribing the pharmacy domain's business roles from the pre-migration Next.js app's
/// <c>lib/security/rbac-types.ts</c> (roles: admin, pharmacist, cashier, manager, staff, superadmin)
/// onto this kit's permission model (docs/pharmacy-modules-plan.md §8 item 4). Deliberately lives in
/// <c>Modules.Identity</c> (not <c>BuildingBlocks</c>, which stays untouched — golden rule #4) and
/// resolves against <see cref="PermissionConstants.All"/> by Resource/Action string match, so it adds
/// no cross-module project references onto the eight pharmacy modules' Contracts assemblies.
///
/// Mapping notes (the old model was 26 flat permission strings; the new one is ~80 granular
/// permissions, so this is a judgment call, not a mechanical rename):
/// - "admin" → the framework's existing <see cref="RoleConstants.Admin"/> role already gets every
///   non-root permission (<c>IdentityDbInitializer.SeedRolesAsync</c>) — no new role needed.
/// - "superadmin" → the Root tenant's Admin role already additionally gets <see cref="PermissionConstants.Root"/>
///   — no new role needed.
/// - "pharmacist"/"cashier"/"manager"/"staff" → new roles seeded here, each granted whole-resource
///   access (every action on a resource) or view-only access, per <see cref="RolePermissionRules"/>.
/// - <c>controlled_substances:dispense</c> → <c>Prescriptions.ControlledSubstances.Dispense</c>, granted
///   to Pharmacist here (and to Admin automatically). It gates selling a controlled medicine at all.
///   It does NOT carry over to <c>Prescriptions.DispensingSafety.Override</c> for pharmacist — that
///   permission bypasses the prescription-validity check entirely (root plan §5: "most roles should
///   never have it"). Only Manager gets Override, alongside Admin.
/// </summary>
internal static class PharmacyRoleSeedData
{
    internal const string Manager = "Manager";
    internal const string Pharmacist = "Pharmacist";
    internal const string Cashier = "Cashier";
    internal const string Staff = "Staff";

    internal static IReadOnlyList<string> Roles { get; } = [Manager, Pharmacist, Cashier, Staff];

    /// <summary>One resource, and either every action on it (<c>Actions: null</c>) or a specific
    /// subset (e.g. view-only).</summary>
    private sealed record ResourceAccess(string Resource, string[]? Actions = null);

    private static readonly Dictionary<string, ResourceAccess[]> RolePermissionRules = new()
    {
        [Manager] =
        [
            new("Inventory.Medicines"), new("Inventory.Batches"), new("Inventory.Reports", [ActionConstants.View]),
            new("Sales.Sales"), new("Sales.CashShifts"),
            new("Prescriptions.Prescriptions"), new("Prescriptions.Reports", [ActionConstants.View]),
            new("Prescriptions.DispensingSafety"),
            new("Customers.Customers"), new("Customers.Ledger"),
            new("Suppliers.Suppliers"), new("Suppliers.Ledger"),
            new("Purchasing.PurchaseOrders"),
            new("Accounting.Accounts", [ActionConstants.View]), new("Accounting.Vouchers"),
            new("Accounting.Reports", [ActionConstants.View]), new("Accounting.Banking"), new("Accounting.Expenses"),
            new("Reference.Categories"), new("Reference.Settings", [ActionConstants.View]),
            // Every tenant-facing Tickets action incl. ViewAll (the tenant support-desk view of every
            // ticket), but NOT ViewCrossTenant — that's root-only (IsRoot: true, superadmin's "All
            // Tenants' Tickets" view), and ResolveFor() matches purely by resource name, so it would
            // otherwise be granted here too.
            new("Tickets", [
                ActionConstants.View, "ViewAll", ActionConstants.Create, ActionConstants.Update, ActionConstants.Delete,
                "Restore", "Assign", "Resolve", "Reopen", "Close", "Comment",
            ]),
        ],
        [Pharmacist] =
        [
            new("Inventory.Medicines", [ActionConstants.View]), new("Inventory.Batches", [ActionConstants.View]),
            new("Prescriptions.Prescriptions"), new("Prescriptions.Reports", [ActionConstants.View]),
            new("Prescriptions.ControlledSubstances"),
            new("Sales.Sales", [ActionConstants.View]),
            new("Customers.Customers"), new("Customers.Ledger", [ActionConstants.View]),
            new("Accounting.Reports", [ActionConstants.View]),
            // Own tickets only (View/Create are basic anyway) — no ViewAll, so the Tickets handlers
            // restrict them to tickets they reported.
            new("Tickets", [ActionConstants.View, ActionConstants.Create]),
        ],
        [Cashier] =
        [
            new("Inventory.Medicines", [ActionConstants.View]), new("Inventory.Batches", [ActionConstants.View]),
            new("Sales.Sales"), new("Sales.CashShifts"),
            new("Customers.Customers"), new("Customers.Ledger", [ActionConstants.View]),
            new("Tickets", [ActionConstants.View, ActionConstants.Create]),
        ],
        [Staff] =
        [
            new("Inventory.Medicines", [ActionConstants.View]),
            new("Sales.Sales", [ActionConstants.View]),
            new("Customers.Customers", [ActionConstants.View]),
            new("Tickets", [ActionConstants.View, ActionConstants.Create]),
        ],
    };

    /// <summary>Resolves a pharmacy role's rule table against whatever permissions modules have
    /// actually registered (<see cref="PermissionConstants.All"/>) — a rule for a resource that
    /// hasn't registered yet, or an action that doesn't exist on it, silently matches nothing rather
    /// than throwing, so this stays safe to run before every pharmacy module ships.</summary>
    internal static IReadOnlyList<FshPermission> ResolveFor(string roleName)
    {
        if (!RolePermissionRules.TryGetValue(roleName, out var rules))
        {
            return [];
        }

        return rules
            .SelectMany(rule => PermissionConstants.All.Where(p =>
                p.Resource == rule.Resource && (rule.Actions is null || rule.Actions.Contains(p.Action))))
            .ToList();
    }
}
