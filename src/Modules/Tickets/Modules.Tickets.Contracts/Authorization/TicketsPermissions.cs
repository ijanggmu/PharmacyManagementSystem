using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Tickets.Contracts.Authorization;

/// <summary>
/// Ticket permissions. Access model (enforced server-side by the Tickets handlers, not just the UI):
/// <list type="bullet">
///   <item><see cref="Tickets.View"/> and <see cref="Tickets.Create"/> are <c>IsBasic</c> — every tenant
///   user holds them. They grant self-service access to the caller's OWN tickets (the ones they
///   reported): list, view, read comments, comment, close a resolved ticket, reopen. Another user's
///   ticket is invisible (404) to a caller without <see cref="Tickets.ViewAll"/>.</item>
///   <item><see cref="Tickets.ViewAll"/> is the tenant-admin view: every ticket of the caller's own
///   tenant (Finbuckle's tenant filter still applies). Combined with Assign/Resolve/Reopen/Close/
///   Comment it allows acting on any ticket of the tenant.</item>
///   <item><see cref="Tickets.ViewCrossTenant"/> stays root-only (SuperAdmin support desk).</item>
/// </list>
/// <see cref="Tickets.View"/> cannot itself be the admin discriminator: it has always been
/// <c>IsBasic</c>, so every existing tenant's Basic role (and the pharmacy Staff/Cashier/Pharmacist
/// roles) already hold it, and role-permission sync is additive-only (claims are never revoked).
/// </summary>
public static class TicketsPermissions
{
    public static class Tickets
    {
        public const string Resource = "Tickets";

        /// <summary>Basic: see and work on the caller's own (reported) tickets.</summary>
        public const string View     = $"Permissions.{Resource}.View";

        /// <summary>Admin: see every ticket of the caller's tenant (tenant-level support desk).</summary>
        public const string ViewAll  = $"Permissions.{Resource}.ViewAll";

        public const string Create   = $"Permissions.{Resource}.Create";
        public const string Update   = $"Permissions.{Resource}.Update";
        public const string Delete   = $"Permissions.{Resource}.Delete";
        public const string Restore  = $"Permissions.{Resource}.Restore";
        public const string Assign   = $"Permissions.{Resource}.Assign";
        public const string Resolve  = $"Permissions.{Resource}.Resolve";
        public const string Reopen   = $"Permissions.{Resource}.Reopen";
        public const string Close    = $"Permissions.{Resource}.Close";
        public const string Comment  = $"Permissions.{Resource}.Comment";

        /// <summary>
        /// Allows querying tickets across all tenants (SuperAdmin support-desk view), bypassing the
        /// ambient Finbuckle tenant filter. Mirrors the Auditing module's
        /// AuditingPermissions.AuditTrails.ViewCrossTenant exactly: without this permission, callers
        /// can only see their own tenant's tickets.
        /// </summary>
        public const string ViewCrossTenant = $"Permissions.{Resource}.ViewCrossTenant";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Own Tickets",    ActionConstants.View,   Tickets.Resource, IsBasic: true),
        new("View All Tenant Tickets", "ViewAll",          Tickets.Resource),
        new("Create Tickets",      ActionConstants.Create, Tickets.Resource, IsBasic: true),
        new("Update Tickets",      ActionConstants.Update, Tickets.Resource),
        new("Delete Tickets",      ActionConstants.Delete, Tickets.Resource),
        new("Restore Tickets",     "Restore", Tickets.Resource),
        new("Assign Tickets",      "Assign",  Tickets.Resource),
        new("Resolve Tickets",     "Resolve", Tickets.Resource),
        new("Reopen Any Ticket",   "Reopen",  Tickets.Resource),
        new("Close Any Ticket",    "Close",   Tickets.Resource),
        new("Comment on Any Ticket", "Comment", Tickets.Resource),
        new("View Tickets Across Tenants", "ViewCrossTenant", Tickets.Resource, IsRoot: true),
    ];
}
