using Asp.Versioning;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Payroll.Contracts.Authorization;
using FSH.Modules.Payroll.Data;
using FSH.Modules.Payroll.Features.v1;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Payroll.PayrollModule), 860)]

namespace FSH.Modules.Payroll;

/// <summary>
/// Nepal payroll: employees, salary structures, monthly runs per branch and Nepali month (SSF, CIT, salary TDS),
/// payslips and the SSF / TDS reports. Posting and paying a run publish integration events (outbox) that Accounting
/// turns into vouchers; this module never writes to the books itself. Publishes only — handles no events.
/// </summary>
public sealed class PayrollModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(PayrollPermissions.All);

        builder.Services.AddHeroDbContext<PayrollDbContext>();
        builder.Services.AddScoped<IDbInitializer, PayrollDbInitializer>();
        builder.Services.TryAddSingleton(TimeProvider.System);

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<PayrollDbContext>(
                name: "db:payroll",
                failureStatus: HealthStatus.Unhealthy);
    }

    public void ConfigureMiddleware(IApplicationBuilder app)
    {
        // No custom middleware needed
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        var versionSet = endpoints.NewApiVersionSet()
            .HasApiVersion(new ApiVersion(1))
            .ReportApiVersions()
            .Build();

        var group = endpoints
            .MapGroup("api/v{version:apiVersion}/payroll")
            .WithTags("Payroll")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        group.MapListEmployeesEndpoint();
        group.MapGetEmployeeEndpoint();
        group.MapCreateEmployeeEndpoint();
        group.MapUpdateEmployeeEndpoint();
        group.MapListSalaryStructuresEndpoint();
        group.MapAddSalaryStructureEndpoint();

        group.MapGetPayrollSettingsEndpoint();
        group.MapUpdatePayrollSettingsEndpoint();

        // Literal /runs/preview before /runs/{id:guid}.
        group.MapGetPayrollRunPreviewEndpoint();
        group.MapListPayrollRunsEndpoint();
        group.MapGetPayrollRunEndpoint();
        group.MapCreatePayrollRunEndpoint();
        group.MapRefreshPayrollRunEndpoint();
        group.MapDeletePayrollRunEndpoint();
        group.MapApprovePayrollRunEndpoint();
        group.MapMarkPayrollRunPostedEndpoint();
        group.MapMarkPayrollRunPaidEndpoint();

        group.MapGetSsfReportEndpoint();
        group.MapGetSalaryTdsReportEndpoint();
    }
}
