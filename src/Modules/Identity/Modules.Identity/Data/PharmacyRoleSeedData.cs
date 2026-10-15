using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Identity.Claims;
using FSH.Modules.Identity.Domain;
using Microsoft.EntityFrameworkCore;

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
    internal const string Accountant = "Accountant";

    internal static IReadOnlyList<string> Roles { get; } = [Manager, Pharmacist, Cashier, Staff, Accountant];

    /// <summary>
    /// Role-claim type marking that a seeded permission has been offered to a pharmacy role once (by the seed
    /// or <c>RolePermissionSyncer</c>). Not a permission: every permission read filters on
    /// <c>ClaimConstants.Permission</c>, so markers never grant anything.
    /// </summary>
    internal const string SeededPermissionClaimType = "fsh.seeded_permission";

    /// <summary>
    /// Role-claim marker recording that a permission the seed USED to grant a role has been retracted from it once
    /// (see <see cref="RetractSeededPermissionsAsync"/>). Like the offer marker it grants nothing.
    /// </summary>
    internal const string RetractedPermissionClaimType = "fsh.retracted_permission";

    /// <summary>The <c>CreatedBy</c> values the seed and <c>RolePermissionSyncer</c> stamp on the claims they add.
    /// Claims an admin adds through the roles UI carry the admin's user id instead.</summary>
    internal static IReadOnlyList<string> SeedClaimAuthors { get; } = ["application", "RolePermissionSyncer"];

    /// <summary>
    /// Permissions earlier versions of the seed granted a role and that it no longer should hold. Cashier used to get
    /// the whole Sales.Sales resource, including cancelling sales and overriding customer credit limits; both now
    /// need a manager approval at the till instead (<c>IApprovalService</c>). Pharmacist used to read the accounting
    /// reports (profit and loss, balance sheet), which are the owner's and accountant's business. Staff used to read
    /// sales history; it is now a lookup-only role (medicines, customers, own tickets).
    /// </summary>
    private static readonly Dictionary<string, string[]> RetractedSeedPermissions = new()
    {
        [Cashier] = ["Permissions.Sales.Sales.Cancel", "Permissions.Sales.Sales.OverrideCreditLimit"],
        [Pharmacist] = ["Permissions.Accounting.Reports.View"],
        [Staff] = ["Permissions.Sales.Sales.View"],
    };

    /// <summary>One resource, and either every action on it (<c>Actions: null</c>) or a specific
    /// subset (e.g. view-only).</summary>
    private sealed record ResourceAccess(string Resource, string[]? Actions = null);

    // The Basic role every user holds carries only what anyone at the counter needs (medicine and batch lookup,
    // pharmacy settings, branches, notifications, own sessions and tickets). Everything a role reads beyond that,
    // sales history and the books included, is granted here explicitly.
    private static readonly Dictionary<string, ResourceAccess[]> RolePermissionRules = new()
    {
        [Manager] =
        [
            new("Inventory.Medicines"), new("Inventory.Batches"), new("Inventory.Reports", [ActionConstants.View]),
            // Runs the stock day to day: moves stock between branches and receives / settles consignment.
            new("Inventory.Consignment"), new("Inventory.StockTransfers"),
            new("Sales.Sales"), new("Sales.PriceLevels"), new("Sales.CashShifts"), new("Sales.Returns"), new("Sales.Refunds"),
            new("Sales.Reports", [ActionConstants.View]), new("Sales.Ird", [ActionConstants.View]),
            new("Prescriptions.Prescriptions"), new("Prescriptions.Reports", [ActionConstants.View]),
            new("Prescriptions.DispensingSafety"),
            new("Customers.Customers"), new("Customers.Ledger"),
            new("Suppliers.Suppliers"), new("Suppliers.Ledger"), new("Suppliers.Returns"), new("Suppliers.PriceLists"),
            new("Purchasing.PurchaseOrders"), new("Purchasing.DirectGoodsReceipts"),
            // Sees who works in the pharmacy; adding users and changing roles stays with Admin.
            new("Users", [ActionConstants.View]), new("UserRoles", [ActionConstants.View]), new("Roles", [ActionConstants.View]),
            new("Accounting.Accounts", [ActionConstants.View]), new("Accounting.Vouchers"),
            new("Accounting.Reports", [ActionConstants.View]), new("Accounting.Banking"), new("Accounting.Expenses"),
            // The finance pages show whether a period is locked; changing the lock stays with the books.
            new("Accounting.PostingLock", [ActionConstants.View]),
            new("Reference.Categories"), new("Reference.Settings", [ActionConstants.View]),
            // Signs off cashiers' restricted actions (discount over cap, void, large refund, credit override,
            // price below cost) and reads the approvals log.
            new("Approvals"),
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
            // Watches expiring and expired stock and the movement history of what they dispense.
            new("Inventory.Reports", [ActionConstants.View]),
            new("Prescriptions.Prescriptions"), new("Prescriptions.Reports", [ActionConstants.View]),
            new("Prescriptions.ControlledSubstances"),
            // Dispenses and bills at the counter like a cashier (small pharmacies rarely split the two): sells,
            // runs the cash drawer and takes returns. Cancels and large refunds still need a manager's approval.
            new("Sales.Sales", [ActionConstants.View, ActionConstants.Create]), new("Sales.CashShifts"),
            new("Sales.Returns", [ActionConstants.View, ActionConstants.Create]),
            new("Sales.Refunds", [ActionConstants.View, ActionConstants.Create]),
            new("Customers.Customers"), new("Customers.Ledger", [ActionConstants.View]),
            // Own tickets only (View/Create are basic anyway) — no ViewAll, so the Tickets handlers
            // restrict them to tickets they reported.
            new("Tickets", [ActionConstants.View, ActionConstants.Create]),
        ],
        [Cashier] =
        [
            new("Inventory.Medicines", [ActionConstants.View]), new("Inventory.Batches", [ActionConstants.View]),
            // View + Create only: cancelling a sale or going past a customer's credit limit needs a manager's
            // approval at the till (see RetractedSeedPermissions for tenants seeded before this changed).
            new("Sales.Sales", [ActionConstants.View, ActionConstants.Create]), new("Sales.CashShifts"),
            // Takes returns at the counter; a refund above the cap still needs a manager's approval.
            new("Sales.Returns", [ActionConstants.View, ActionConstants.Create]),
            new("Sales.Refunds", [ActionConstants.View, ActionConstants.Create]),
            // Reads prescriptions to attach one to a sale.
            new("Prescriptions.Prescriptions", [ActionConstants.View]),
            new("Customers.Customers"), new("Customers.Ledger", [ActionConstants.View]),
            new("Tickets", [ActionConstants.View, ActionConstants.Create]),
        ],
        // Books and reports, no till: every accounting resource, the ledgers' payments, read-only views of
        // sales/stock/purchases for reconciliation, and the approvals log. No sale create/cancel, no approvals.
        [Accountant] =
        [
            new("Accounting.Accounts"), new("Accounting.Vouchers"), new("Accounting.Reports"),
            new("Accounting.PostingLock"), new("Accounting.Banking"), new("Accounting.Expenses"),
            new("Sales.Sales", [ActionConstants.View]), new("Sales.Reports", [ActionConstants.View]),
            new("Sales.Ird", [ActionConstants.View]), new("Sales.Returns", [ActionConstants.View]),
            new("Sales.Refunds", [ActionConstants.View]), new("Sales.CashShifts", [ActionConstants.View]),
            new("Inventory.Medicines", [ActionConstants.View]), new("Inventory.Reports", [ActionConstants.View]),
            new("Purchasing.PurchaseOrders", [ActionConstants.View]),
            new("Purchasing.DirectGoodsReceipts", [ActionConstants.View]),
            new("Customers.Customers", [ActionConstants.View]),
            new("Customers.Ledger", [ActionConstants.View, "RecordPayment", "VoidPayment"]),
            new("Suppliers.Suppliers", [ActionConstants.View]), new("Suppliers.Ledger"),
            new("Suppliers.Returns", [ActionConstants.View]),
            new("Suppliers.PriceLists", [ActionConstants.View]),
            new("Reference.Settings", [ActionConstants.View]),
            new("Approvals", [ActionConstants.View]),
            // Payroll: employees, runs, posting and paying salaries. Not given to Manager because salaries are
            // confidential, and Admin holds it anyway.
            new("Payroll.Payroll"),
            new("Tickets", [ActionConstants.View, ActionConstants.Create]),
        ],
        // Lookup only: find a medicine, find a customer, raise a ticket. No sales history.
        [Staff] =
        [
            new("Inventory.Medicines", [ActionConstants.View]),
            new("Customers.Customers", [ActionConstants.View]),
            new("Tickets", [ActionConstants.View, ActionConstants.Create]),
        ],
    };

    /// <summary>
    /// Grants each of <paramref name="seededPermissions"/> that the role has not been offered before (no
    /// <see cref="SeededPermissionClaimType"/> marker yet) and records a marker for it, so a permission a tenant
    /// admin later removes is not re-granted. Permissions already offered are left exactly as the admin set
    /// them. Returns the number of permission claims added.
    /// </summary>
    internal static async Task<int> OfferSeededPermissionsAsync(
        IdentityDbContext context,
        string roleId,
        IReadOnlyList<FshPermission> seededPermissions,
        string createdBy,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var claims = await context.RoleClaims
            .Where(rc => rc.RoleId == roleId
                && (rc.ClaimType == ClaimConstants.Permission || rc.ClaimType == SeededPermissionClaimType))
            .Select(rc => new { rc.ClaimType, rc.ClaimValue })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var granted = claims.Where(c => c.ClaimType == ClaimConstants.Permission).Select(c => c.ClaimValue!).ToHashSet(StringComparer.Ordinal);
        var offered = claims.Where(c => c.ClaimType == SeededPermissionClaimType).Select(c => c.ClaimValue!).ToHashSet(StringComparer.Ordinal);

        var newClaims = new List<FshRoleClaim>();
        int permissionsAdded = 0;
        foreach (var permission in seededPermissions.Where(p => !offered.Contains(p.Name)).DistinctBy(p => p.Name))
        {
            if (!granted.Contains(permission.Name))
            {
                newClaims.Add(NewClaim(ClaimConstants.Permission));
                permissionsAdded++;
            }

            newClaims.Add(NewClaim(SeededPermissionClaimType));

            FshRoleClaim NewClaim(string type) => new()
            {
                RoleId = roleId,
                ClaimType = type,
                ClaimValue = permission.Name,
                CreatedBy = createdBy,
                CreatedOn = now,
            };
        }

        if (newClaims.Count == 0)
        {
            return 0;
        }

        await context.RoleClaims.AddRangeAsync(newClaims, cancellationToken).ConfigureAwait(false);
        await context.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return permissionsAdded;
    }

    /// <summary>
    /// Removes, once per role and permission, a permission the seed itself granted (claim <c>CreatedBy</c> is one of
    /// <see cref="SeedClaimAuthors"/>) that <see cref="RetractedSeedPermissions"/> now withholds from the role, and
    /// records a <see cref="RetractedPermissionClaimType"/> marker so it is never retracted again. A claim an admin
    /// granted through the roles UI (stamped with their user id) is left alone, and so is one an admin re-grants
    /// after the retraction. Returns the number of permission claims removed.
    /// </summary>
    internal static async Task<int> RetractSeededPermissionsAsync(
        IdentityDbContext context,
        string roleId,
        string roleName,
        string createdBy,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (!RetractedSeedPermissions.TryGetValue(roleName, out var retracted))
        {
            return 0;
        }

        var alreadyRetracted = await context.RoleClaims
            .Where(rc => rc.RoleId == roleId && rc.ClaimType == RetractedPermissionClaimType)
            .Select(rc => rc.ClaimValue!)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var pending = retracted.Except(alreadyRetracted, StringComparer.Ordinal).ToList();
        if (pending.Count == 0)
        {
            return 0;
        }

        var authors = SeedClaimAuthors.ToList();
        var seedGranted = await context.RoleClaims
            .Where(rc => rc.RoleId == roleId
                && rc.ClaimType == ClaimConstants.Permission
                && pending.Contains(rc.ClaimValue!)
                && rc.CreatedBy != null && authors.Contains(rc.CreatedBy))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        context.RoleClaims.RemoveRange(seedGranted);
        await context.RoleClaims.AddRangeAsync(
            pending.Select(permission => new FshRoleClaim
            {
                RoleId = roleId,
                ClaimType = RetractedPermissionClaimType,
                ClaimValue = permission,
                CreatedBy = createdBy,
                CreatedOn = now,
            }),
            cancellationToken).ConfigureAwait(false);
        await context.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return seedGranted.Count;
    }

    /// <summary>The permissions retracted from <paramref name="roleName"/> (see <see cref="RetractedSeedPermissions"/>).</summary>
    internal static IReadOnlyList<string> RetractedFor(string roleName) =>
        RetractedSeedPermissions.TryGetValue(roleName, out var retracted) ? retracted : [];

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
