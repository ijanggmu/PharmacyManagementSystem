using Asp.Versioning;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Onboarding.Contracts.Authorization;
using FSH.Modules.Onboarding.Data;
using FSH.Modules.Onboarding.Features.v1.Migration.CommitMigrationSession;
using FSH.Modules.Onboarding.Features.v1.Migration.GetMigrationSessionStatus;
using FSH.Modules.Onboarding.Features.v1.Migration.SaveDraftLines;
using FSH.Modules.Onboarding.Features.v1.Migration.StartMigrationSession;
using FSH.Modules.Onboarding.Features.v1.Onboarding.CompleteOnboarding;
using FSH.Modules.Onboarding.Features.v1.Onboarding.GetOnboardingStatus;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Onboarding.OnboardingModule), 1100)]

namespace FSH.Modules.Onboarding;

public sealed class OnboardingModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(OnboardingPermissions.All);

        builder.Services.AddHeroDbContext<OnboardingDbContext>();
        builder.Services.AddScoped<IDbInitializer, OnboardingDbInitializer>();

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<OnboardingDbContext>(
                name: "db:onboarding",
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
            .MapGroup("api/v{version:apiVersion}/onboarding")
            .WithTags("Onboarding")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        group.MapGetOnboardingStatusEndpoint();
        group.MapFinalizeOnboardingEndpoint();

        group.MapStartMigrationSessionEndpoint();
        group.MapSaveDraftLinesEndpoint();
        group.MapGetMigrationSessionStatusEndpoint();
        group.MapCommitMigrationSessionEndpoint();
    }
}
