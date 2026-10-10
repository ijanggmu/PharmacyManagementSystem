using Asp.Versioning;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Data;
using FSH.Modules.Reference.Features.v1.Dashboard.GetDashboardContext;
using FSH.Modules.Reference.Features.v1.Categories.CreateMedicineCategory;
using FSH.Modules.Reference.Features.v1.Categories.DeleteMedicineCategory;
using FSH.Modules.Reference.Features.v1.Categories.GetMedicineCategoryById;
using FSH.Modules.Reference.Features.v1.Categories.GetMedicineCategoryTree;
using FSH.Modules.Reference.Features.v1.Categories.ListTrashedMedicineCategories;
using FSH.Modules.Reference.Features.v1.Categories.RestoreMedicineCategory;
using FSH.Modules.Reference.Features.v1.Categories.SearchMedicineCategories;
using FSH.Modules.Reference.Features.v1.Categories.UpdateMedicineCategory;
using FSH.Modules.Reference.Features.v1.Settings.GetPharmacySettings;
using FSH.Modules.Reference.Features.v1.Settings.UpdatePharmacySettings;
using FSH.Modules.Reference.Features.v1.TenantSettings.GetTenantSettings;
using FSH.Modules.Reference.Features.v1.TenantSettings.UpsertTenantSetting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Reference.ReferenceModule), 820)]

namespace FSH.Modules.Reference;

public sealed class ReferenceModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(ReferencePermissions.All);

        builder.Services.AddHeroDbContext<ReferenceDbContext>();
        builder.Services.AddScoped<IDbInitializer, ReferenceDbInitializer>();

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<ReferenceDbContext>(
                name: "db:reference",
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
            .MapGroup("api/v{version:apiVersion}/reference")
            .WithTags("Reference")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        // Literal /categories/tree and /categories/trash before /categories/{id:guid}.
        group.MapGetMedicineCategoryTreeEndpoint();
        group.MapListTrashedMedicineCategoriesEndpoint();
        group.MapRestoreMedicineCategoryEndpoint();
        group.MapCreateMedicineCategoryEndpoint();
        group.MapUpdateMedicineCategoryEndpoint();
        group.MapDeleteMedicineCategoryEndpoint();
        group.MapGetMedicineCategoryByIdEndpoint();
        group.MapSearchMedicineCategoriesEndpoint();

        group.MapGetPharmacySettingsEndpoint();
        group.MapUpdatePharmacySettingsEndpoint();

        // GET /settings/all (literal) and PUT /settings/{key} (generic); GET /settings stays PharmacySettings.
        group.MapGetTenantSettingsEndpoint();
        group.MapUpsertTenantSettingEndpoint();

        group.MapGetDashboardContextEndpoint();
    }
}
