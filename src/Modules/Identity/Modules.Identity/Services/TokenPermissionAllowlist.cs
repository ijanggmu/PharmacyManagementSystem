namespace FSH.Modules.Identity.Services;

/// <summary>
/// Restricts which "permission" claims get embedded into issued JWTs to the resources this
/// pharmacy app's frontend actually checks. The role claims stored in the database (synced by
/// <c>RolePermissionSyncer</c>) are unchanged and still hold every starter-kit permission for
/// Admin — this type only trims what <see cref="IdentityService"/> writes into the token, so the
/// permission-claim payload (and so the session cookie) stays small for every role as the app's
/// module set grows, instead of just patching root Admin once.
///
/// Without this filter, root Admin's token carries one "permission" claim per permission string
/// across every starter-kit module (Chat, Tickets, Webhooks, Billing, Files, Groups, Hangfire,
/// Impersonation, Sessions, AuditTrails, RoleClaims, Catalog, generic Platform, ...) even though
/// this app never uses most of them. That pushed the token to ~10.8KB, past the ~4096 byte limit
/// browsers/curl apply to a single cookie, so the cookie was silently dropped and every request
/// after login came back unauthenticated.
///
/// Keep this allowlist in sync with the frontend's authoritative permission list:
/// - lib/api/dotnet-permissions.ts (DOTNET_PERMISSION_MAP, DOTNET_ROOT_PERMISSIONS)
/// - lib/api/dotnet-session.ts (TENANT_USER_PERMISSION_PREFIX, isSuperAdmin's "Platform." check)
/// - lib/api/branches-api.ts (BRANCHES_MANAGE_PERMISSION)
/// in the frontend repo (PharmacyManagementSystem).
/// </summary>
internal static class TokenPermissionAllowlist
{
    /// <summary>
    /// Resource name is the segment between "Permissions." and the trailing ".{Action}" in a
    /// permission's Name (see FshPermission.NameFor). One entry per *Permissions.cs "Resource"
    /// constant this app's frontend reads from, grouped by module.
    /// </summary>
    private static readonly HashSet<string> AllowedResources = new(StringComparer.Ordinal)
    {
        // Sales
        "Sales.Sales", "Sales.CashShifts", "Sales.Returns", "Sales.Refunds", "Sales.Reports", "Sales.Ird",

        // Inventory
        "Inventory.Medicines", "Inventory.Batches", "Inventory.Reports", "Inventory.Consignment",
        "Inventory.StockTransfers",

        // Purchasing
        "Purchasing.PurchaseOrders", "Purchasing.DirectGoodsReceipts",

        // Suppliers
        "Suppliers.Suppliers", "Suppliers.Ledger", "Suppliers.Returns",

        // Customers
        "Customers.Customers", "Customers.Ledger",

        // Prescriptions
        "Prescriptions.Prescriptions", "Prescriptions.Reports", "Prescriptions.ControlledSubstances",
        "Prescriptions.DispensingSafety",

        // Accounting
        "Accounting.Accounts", "Accounting.Vouchers", "Accounting.Reports", "Accounting.PostingLock",
        "Accounting.Banking", "Accounting.Expenses",

        // Reference (pharmacy settings/categories + the dashboard-bootstrap resource)
        "Reference.Categories", "Reference.Settings", "Reference.Dashboard",

        // Multitenancy: branches (tenant-owned, non-root) and tenants (root-only — every permission
        // under this resource is IsRoot: true, so including it is a no-op for non-root tenants).
        "Branches", "Tenants",

        // Identity: only the resources the frontend's role/user management UI checks. Deliberately
        // excludes Groups, Sessions, Impersonation and RoleClaims — unused by this app's frontend.
        "Users", "UserRoles", "Roles",

        // Notifications
        "Notifications.Inbox",

        // Onboarding / data-migration wizard
        "Onboarding.Onboarding", "Onboarding.Migration",

        // Cross-cutting dashboard-bootstrap permission (SystemPermissions.Dashboard)
        "Dashboard",

        // Platform (SuperAdmin tenant-management pages). Every permission under these resources is
        // IsRoot: true (SystemPermissions.Platform), so only the root tenant's Admin role ever holds
        // them — allowing the resource here cannot grant anything to a non-root tenant's roles.
        "Platform.Tenants", "Platform.Plans", "Platform.Subscriptions", "Platform.Invoices",
        "Platform.Webhooks", "Platform.Audits", "Platform.Users",

        // Billing: the SuperAdmin tenant list/overview now reads plan + subscription status + invoice
        // history from the Billing module's endpoints (RequirePermission(BillingPermissions.View) /
        // .Manage). Both were previously dropped here as "unused by this app's frontend" — now used.
        "Billing",
    };

    /// <summary>
    /// Exact permission names kept even though their resource is otherwise excluded.
    /// AuditTrails.View is IsBasic (every role holds it) and nothing in the frontend reads it, so
    /// the AuditTrails resource is dropped — except ViewCrossTenant, which is one of the frontend's
    /// DOTNET_ROOT_PERMISSIONS: isDotnetRootUser()/isSuperAdmin() require every listed permission to
    /// be present to recognize the root Admin, so dropping it would break SuperAdmin detection.
    ///
    /// Tickets: only the permissions the frontend's tickets UI reads (lib/api/tickets-api.ts —
    /// canViewTickets / canViewAllTickets / canAssignTickets / canResolveTickets / canReopenTickets /
    /// canCloseTickets / canCommentOnTickets, plus the root-only canViewTicketsAcrossTenants nav
    /// gate). View/Create are basic (every user's own tickets + "Report an issue"); ViewAll marks a
    /// tenant ticket admin. Update/Delete/Restore stay dropped — the frontend never checks them.
    /// </summary>
    private static readonly HashSet<string> AllowedExact = new(StringComparer.Ordinal)
    {
        "Permissions.AuditTrails.ViewCrossTenant",
        "Permissions.Tickets.ViewCrossTenant",
        "Permissions.Tickets.View",
        "Permissions.Tickets.ViewAll",
        "Permissions.Tickets.Create",
        "Permissions.Tickets.Assign",
        "Permissions.Tickets.Resolve",
        "Permissions.Tickets.Reopen",
        "Permissions.Tickets.Close",
        "Permissions.Tickets.Comment",
    };

    /// <summary>Keeps only the permission names this app's frontend can act on.</summary>
    public static IEnumerable<string> Filter(IEnumerable<string> permissions) =>
        permissions.Where(IsAllowed);

    private static bool IsAllowed(string permission)
    {
        if (AllowedExact.Contains(permission))
        {
            return true;
        }

        const string prefix = "Permissions.";
        if (!permission.StartsWith(prefix, StringComparison.Ordinal))
        {
            return false;
        }

        var lastDot = permission.LastIndexOf('.');
        if (lastDot <= prefix.Length)
        {
            return false;
        }

        var resource = permission[prefix.Length..lastDot];
        return AllowedResources.Contains(resource);
    }
}
