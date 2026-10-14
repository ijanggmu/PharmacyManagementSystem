using Asp.Versioning;
using FSH.Framework.Eventing;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.GetDirectGoodsReceiptById;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.ListDirectGoodsReceipts;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.VoidDirectGoodsReceipt;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ApprovePurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CancelPurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderById;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderStatusCounts;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.SearchPurchaseOrders;
using FSH.Modules.Purchasing.Features.v1.Reports.GetIrdPurchaseRegister;
using FSH.Modules.Purchasing.Features.v1.Reports.GetReorderSuggestions;
using FSH.Modules.Purchasing.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Purchasing.PurchasingModule), 950)]

namespace FSH.Modules.Purchasing;

public sealed class PurchasingModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(PurchasingPermissions.All);

        builder.Services.AddHeroDbContext<PurchasingDbContext>();
        builder.Services.AddScoped<IDbInitializer, PurchasingDbInitializer>();
        builder.Services.AddIntegrationEventHandlers(typeof(PurchasingModule).Assembly);
        builder.Services.AddScoped<IReceiptNumberService, ReceiptNumberService>();

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<PurchasingDbContext>(
                name: "db:purchasing",
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
            .MapGroup("api/v{version:apiVersion}/purchasing")
            .WithTags("Purchasing")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        // Date-only and zoneless query dates reach the handlers as UTC (a date as the Nepal day's bounds), not as
        // the Unspecified DateTime Npgsql refuses.
        group.AddEndpointFilterFactory(PurchasingQueryDates.Factory);

        group.MapCreatePurchaseOrderEndpoint();
        group.MapApprovePurchaseOrderEndpoint();
        group.MapCapturePurchaseOrderReceiptEndpoint();
        group.MapVoidPurchaseOrderEndpoint();
        group.MapGetPurchaseOrderByIdEndpoint();
        group.MapGetPurchaseOrderStatusCountsEndpoint();
        group.MapSearchPurchaseOrdersEndpoint();

        group.MapCreateDirectGoodsReceiptEndpoint();
        group.MapVoidDirectGoodsReceiptEndpoint();
        group.MapGetDirectGoodsReceiptByIdEndpoint();
        group.MapListDirectGoodsReceiptsEndpoint();

        group.MapGetReorderSuggestionsEndpoint();
        group.MapGetIrdPurchaseRegisterEndpoint();
    }
}
