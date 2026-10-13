using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Payroll.Contracts.Authorization;

/// <summary>
/// Payroll is confidential (salaries, PAN, bank accounts), so nothing here is basic. Only <see cref="Payroll.View"/>
/// travels in the access token (the web app's Payroll nav and pages gate on it); the other actions are server-only
/// gates — the UI shows the buttons and surfaces the API's 403 — so they cost no cookie bytes
/// (<c>TokenPermissionAllowlist</c>).
/// </summary>
public static class PayrollPermissions
{
    public static class Payroll
    {
        public const string Resource = "Payroll.Payroll";

        /// <summary>Employees, salary structures, payroll runs, payslips and the SSF / salary TDS reports.</summary>
        public const string View = $"Permissions.{Resource}.View";

        /// <summary>Add / edit employees and salary structures, edit payroll settings, prepare (draft) runs.</summary>
        public const string Manage = $"Permissions.{Resource}.Manage";

        /// <summary>Approve a draft run.</summary>
        public const string Approve = $"Permissions.{Resource}.Approve";

        /// <summary>Post an approved run to the books and record it as paid.</summary>
        public const string Post = $"Permissions.{Resource}.Post";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Payroll", ActionConstants.View, Payroll.Resource),
        new("Manage Payroll", "Manage", Payroll.Resource),
        new("Approve Payroll Runs", "Approve", Payroll.Resource),
        new("Post and Pay Payroll Runs", "Post", Payroll.Resource),
    ];
}
