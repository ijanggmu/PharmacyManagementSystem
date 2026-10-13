using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Payroll.Contracts.Authorization;
using FSH.Modules.Payroll.Contracts.v1;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Payroll.Features.v1;

// Routes are relative to the module group "api/v1/payroll". Reads need Payroll.View; employee / structure / settings
// edits and drafting runs need Payroll.Manage; approving needs Payroll.Approve; posting and paying need Payroll.Post.

public static class ListEmployeesEndpoint
{
    internal static RouteHandlerBuilder MapListEmployeesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/employees",
                async (Guid? branchId, bool? includeInactive, string? search, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ListEmployeesQuery(branchId, includeInactive ?? false, search), ct)))
            .WithName("ListPayrollEmployees")
            .WithSummary("Employees on the payroll, with their current salary structure")
            .RequirePermission(PayrollPermissions.Payroll.View);
}

public static class GetEmployeeEndpoint
{
    internal static RouteHandlerBuilder MapGetEmployeeEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/employees/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken ct) => Results.Ok(await mediator.Send(new GetEmployeeQuery(id), ct)))
            .WithName("GetPayrollEmployee")
            .WithSummary("One employee with the current salary structure")
            .RequirePermission(PayrollPermissions.Payroll.View);
}

public static class CreateEmployeeEndpoint
{
    internal static RouteHandlerBuilder MapCreateEmployeeEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/employees",
                async (CreateEmployeeCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreatePayrollEmployee")
            .WithSummary("Add an employee to the payroll")
            .RequirePermission(PayrollPermissions.Payroll.Manage)
            .WithIdempotency();
}

public static class UpdateEmployeeEndpoint
{
    internal static RouteHandlerBuilder MapUpdateEmployeeEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPut("/employees/{id:guid}",
                async (Guid id, UpdateEmployeeCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { Id = id }, ct));
                })
            .WithName("UpdatePayrollEmployee")
            .WithSummary("Edit an employee (or deactivate one)")
            .RequirePermission(PayrollPermissions.Payroll.Manage);
}

public static class ListSalaryStructuresEndpoint
{
    internal static RouteHandlerBuilder MapListSalaryStructuresEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/employees/{id:guid}/salary-structures",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ListSalaryStructuresQuery(id), ct)))
            .WithName("ListPayrollSalaryStructures")
            .WithSummary("An employee's salary structures, newest effective date first")
            .RequirePermission(PayrollPermissions.Payroll.View);
}

public static class AddSalaryStructureEndpoint
{
    internal static RouteHandlerBuilder MapAddSalaryStructureEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/employees/{id:guid}/salary-structures",
                async (Guid id, AddSalaryStructureCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { EmployeeId = id }, ct));
                })
            .WithName("AddPayrollSalaryStructure")
            .WithSummary("Add a salary structure effective from a date")
            .RequirePermission(PayrollPermissions.Payroll.Manage)
            .WithIdempotency();
}

public static class GetPayrollSettingsEndpoint
{
    internal static RouteHandlerBuilder MapGetPayrollSettingsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/settings",
                async (IMediator mediator, CancellationToken ct) => Results.Ok(await mediator.Send(new GetPayrollSettingsQuery(), ct)))
            .WithName("GetPayrollSettings")
            .WithSummary("SSF rates, the retirement deduction cap and the tax slabs in use")
            .RequirePermission(PayrollPermissions.Payroll.View);
}

public static class UpdatePayrollSettingsEndpoint
{
    internal static RouteHandlerBuilder MapUpdatePayrollSettingsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPut("/settings",
                async (UpdatePayrollSettingsCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("UpdatePayrollSettings")
            .WithSummary("Edit the SSF rates and the retirement deduction cap")
            .RequirePermission(PayrollPermissions.Payroll.Manage);
}

public static class GetPayrollRunPreviewEndpoint
{
    internal static RouteHandlerBuilder MapGetPayrollRunPreviewEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/runs/preview",
                async (Guid branchId, int bsYear, int bsMonth, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new PreviewPayrollRunQuery(branchId, bsYear, bsMonth), ct)))
            .WithName("PreviewPayrollRun")
            .WithSummary("Compute a branch's payroll for a Nepali month without saving it")
            .RequirePermission(PayrollPermissions.Payroll.View);
}

public static class ListPayrollRunsEndpoint
{
    internal static RouteHandlerBuilder MapListPayrollRunsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/runs",
                async (Guid? branchId, int? fiscalYear, string? status, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ListPayrollRunsQuery(branchId, fiscalYear, status), ct)))
            .WithName("ListPayrollRuns")
            .WithSummary("Payroll runs, newest month first (totals only)")
            .RequirePermission(PayrollPermissions.Payroll.View);
}

public static class GetPayrollRunEndpoint
{
    internal static RouteHandlerBuilder MapGetPayrollRunEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/runs/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken ct) => Results.Ok(await mediator.Send(new GetPayrollRunQuery(id), ct)))
            .WithName("GetPayrollRun")
            .WithSummary("A payroll run with every employee's line (payslips, register)")
            .RequirePermission(PayrollPermissions.Payroll.View);
}

public static class CreatePayrollRunEndpoint
{
    internal static RouteHandlerBuilder MapCreatePayrollRunEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/runs",
                async (CreatePayrollRunCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreatePayrollRun")
            .WithSummary("Create a draft payroll run for a branch and Nepali month")
            .RequirePermission(PayrollPermissions.Payroll.Manage)
            .WithIdempotency();
}

public static class RefreshPayrollRunEndpoint
{
    internal static RouteHandlerBuilder MapRefreshPayrollRunEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/runs/{id:guid}/recalculate",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new RecalculatePayrollRunCommand(id), ct)))
            .WithName("RecalculatePayrollRun")
            .WithSummary("Recompute a draft run from the current employees, structures and settings")
            .RequirePermission(PayrollPermissions.Payroll.Manage);
}

public static class DeletePayrollRunEndpoint
{
    internal static RouteHandlerBuilder MapDeletePayrollRunEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapDelete("/runs/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new DeletePayrollRunCommand(id), ct);
                    return Results.NoContent();
                })
            .WithName("DeletePayrollRun")
            .WithSummary("Delete a draft payroll run")
            .RequirePermission(PayrollPermissions.Payroll.Manage);
}

public static class ApprovePayrollRunEndpoint
{
    internal static RouteHandlerBuilder MapApprovePayrollRunEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/runs/{id:guid}/approve",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ApprovePayrollRunCommand(id), ct)))
            .WithName("ApprovePayrollRun")
            .WithSummary("Approve a draft payroll run")
            .RequirePermission(PayrollPermissions.Payroll.Approve);
}

public static class MarkPayrollRunPostedEndpoint
{
    internal static RouteHandlerBuilder MapMarkPayrollRunPostedEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/runs/{id:guid}/post",
                async (Guid id, PostPayrollRunCommand? body, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new PostPayrollRunCommand(id, body?.PostingDate), ct)))
            .WithName("PostPayrollRun")
            .WithSummary("Post an approved run to the books (salary accrual journal)")
            .RequirePermission(PayrollPermissions.Payroll.Post)
            .WithIdempotency();
}

public static class MarkPayrollRunPaidEndpoint
{
    internal static RouteHandlerBuilder MapMarkPayrollRunPaidEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/runs/{id:guid}/pay",
                async (Guid id, PayPayrollRunCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { RunId = id }, ct));
                })
            .WithName("PayPayrollRun")
            .WithSummary("Record a posted run as paid (salary payment voucher)")
            .RequirePermission(PayrollPermissions.Payroll.Post)
            .WithIdempotency();
}

public static class GetSsfReportEndpoint
{
    internal static RouteHandlerBuilder MapGetSsfReportEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/reports/ssf",
                async (int bsYear, int bsMonth, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetSsfReportQuery(bsYear, bsMonth, branchId), ct)))
            .WithName("GetPayrollSsfReport")
            .WithSummary("Monthly SSF contributions (employee + employer) from posted runs")
            .RequirePermission(PayrollPermissions.Payroll.View);
}

public static class GetSalaryTdsReportEndpoint
{
    internal static RouteHandlerBuilder MapGetSalaryTdsReportEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/reports/tds",
                async (int bsYear, int bsMonth, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetSalaryTdsReportQuery(bsYear, bsMonth, branchId), ct)))
            .WithName("GetPayrollSalaryTdsReport")
            .WithSummary("Monthly salary TDS (social security tax + income tax) from posted runs")
            .RequirePermission(PayrollPermissions.Payroll.View);
}
