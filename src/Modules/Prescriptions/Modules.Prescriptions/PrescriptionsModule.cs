using Asp.Versioning;
using FSH.Framework.Eventing;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.CancelPrescription;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.CreatePrescription;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.DeletePrescription;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.GetPrescriptionById;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.SearchPrescriptions;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.UpdatePrescription;
using FSH.Modules.Prescriptions.Features.v1.Refills.CreatePrescriptionRefill;
using FSH.Modules.Prescriptions.Features.v1.Refills.GetPrescriptionRefillById;
using FSH.Modules.Prescriptions.Features.v1.Refills.SearchPrescriptionRefills;
using FSH.Modules.Prescriptions.Features.v1.Reports.GetPrescriptionStats;
using FSH.Modules.Prescriptions.Features.v1.Reports.GetRefillsDue;
using FSH.Modules.Prescriptions.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Prescriptions.PrescriptionsModule), 1000)]

namespace FSH.Modules.Prescriptions;

public sealed class PrescriptionsModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(PrescriptionsPermissions.All);

        builder.Services.AddHeroDbContext<PrescriptionsDbContext>();
        builder.Services.AddScoped<IDbInitializer, PrescriptionsDbInitializer>();

        // The cross-module surface: Sales references only Modules.Prescriptions.Contracts and
        // injects this interface to check/record dispensing before opening its own transaction.
        builder.Services.AddScoped<DispensingSafetyPolicy>();
        builder.Services.AddScoped<IDispensingSafetyPolicy>(sp => sp.GetRequiredService<DispensingSafetyPolicy>());
        builder.Services.AddScoped<SaleDispenseReversalService>();
        builder.Services.AddScoped<PrescriptionNumberService>();
        builder.Services.AddScoped<PrescriptionNameResolver>();
        builder.Services.AddScoped<PrescriptionIssueChecks>();

        // Subscribe to cross-module integration events handled by this assembly (Sales' completed-sale
        // event drives refill/dispensed-quantity bookkeeping — see docs/pharmacy-modules-plan.md §2).
        builder.Services.AddIntegrationEventHandlers(typeof(PrescriptionsModule).Assembly);

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<PrescriptionsDbContext>(
                name: "db:prescriptions",
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
            .MapGroup("api/v{version:apiVersion}/prescriptions")
            .WithTags("Prescriptions")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        group.MapCreatePrescriptionEndpoint();
        group.MapVoidPrescriptionEndpoint();
        group.MapGetPrescriptionByIdEndpoint();
        group.MapSearchPrescriptionsEndpoint();
        group.MapUpdatePrescriptionEndpoint();
        group.MapDeletePrescriptionEndpoint();

        group.MapSearchPrescriptionRefillsEndpoint();
        group.MapGetPrescriptionRefillByIdEndpoint();
        group.MapCreatePrescriptionRefillEndpoint();

        group.MapGetRefillsDueEndpoint();
        group.MapGetPrescriptionStatsEndpoint();
    }
}
