using Asp.Versioning;
using FSH.Framework.Eventing;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Features.v1.Batches.AdjustBatchQuantity;
using FSH.Modules.Inventory.Features.v1.Batches.UpdateBatchSellingPrice;
using FSH.Modules.Inventory.Features.v1.Batches.CreateBatch;
using FSH.Modules.Inventory.Features.v1.Batches.DisposeBatch;
using FSH.Modules.Inventory.Features.v1.Batches.GetBatchById;
using FSH.Modules.Inventory.Features.v1.Batches.SearchBatches;
using FSH.Modules.Inventory.Features.v1.Consignment.ListConsignmentSettlements;
using FSH.Modules.Inventory.Features.v1.Consignment.ReceiveConsignmentStock;
using FSH.Modules.Inventory.Features.v1.Consignment.SearchConsignmentPositions;
using FSH.Modules.Inventory.Features.v1.Consignment.SettleConsignment;
using FSH.Modules.Inventory.Features.v1.MedicineCatalog.SearchNepalMedicineCatalog;
using FSH.Modules.Inventory.Features.v1.Medicines.BulkCreateMedicines;
using FSH.Modules.Inventory.Features.v1.Medicines.AddMedicineStock;
using FSH.Modules.Inventory.Features.v1.Medicines.CreateMedicine;
using FSH.Modules.Inventory.Features.v1.Medicines.DeleteMedicine;
using FSH.Modules.Inventory.Features.v1.Medicines.FindSimilarMedicineNames;
using FSH.Modules.Inventory.Features.v1.Medicines.GenerateMedicineBarcode;
using FSH.Modules.Inventory.Features.v1.Medicines.FindDuplicateMedicines;
using FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineById;
using FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineStats;
using FSH.Modules.Inventory.Features.v1.Medicines.RecallMedicineBatch;
using FSH.Modules.Inventory.Features.v1.Medicines.ListTrashedMedicines;
using FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;
using FSH.Modules.Inventory.Features.v1.Medicines.RestoreMedicine;
using FSH.Modules.Inventory.Features.v1.Medicines.SearchMedicines;
using FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;
using FSH.Modules.Inventory.Features.v1.Reports.GetCategoryPerformance;
using FSH.Modules.Inventory.Features.v1.Reports.GetDeadStock;
using FSH.Modules.Inventory.Features.v1.Reports.GetExpiredBatches;
using FSH.Modules.Inventory.Features.v1.Reports.GetExpiringBatches;
using FSH.Modules.Inventory.Features.v1.Reports.GetInventoryDiscrepancyReport;
using FSH.Modules.Inventory.Features.v1.Reports.GetReorderSuggestions;
using FSH.Modules.Inventory.Features.v1.Reports.GetTopSellingMedicines;
using FSH.Modules.Inventory.Features.v1.StockCounts;
using FSH.Modules.Inventory.Features.v1.StockTransfers.CancelStockTransfer;
using FSH.Modules.Inventory.Features.v1.StockTransfers.CreateStockTransfer;
using FSH.Modules.Inventory.Features.v1.StockTransfers.ReceiveStockTransfer;
using FSH.Modules.Inventory.Features.v1.StockTransfers.SearchStockTransfers;
using FSH.Modules.Inventory.Features.v1.Transactions.SearchInventoryTransactions;
using FSH.Modules.Inventory.Jobs;
using FSH.Modules.Inventory.Services;
using Hangfire;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Inventory.InventoryModule), 900)]

namespace FSH.Modules.Inventory;

public sealed class InventoryModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(InventoryPermissions.All);

        builder.Services.AddHeroDbContext<InventoryDbContext>();
        builder.Services.AddScoped<IDbInitializer, InventoryDbInitializer>();

        // The cross-module surface: Purchasing and Sales reference only Modules.Inventory.Contracts
        // and inject these interfaces.
        builder.Services.AddScoped<IStockDeductionService, StockDeductionService>();
        builder.Services.AddScoped<IStockReceiptService, StockReceiptService>();
        builder.Services.AddScoped<IControlledMedicineChecker, ControlledMedicineChecker>();

        // Subscribe to cross-module integration events handled by this assembly (Sales' cancelled-sale
        // event drives restocking — see docs/pharmacy-modules-plan.md §2).
        builder.Services.AddIntegrationEventHandlers(typeof(InventoryModule).Assembly);

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<InventoryDbContext>(
                name: "db:inventory",
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
            .MapGroup("api/v{version:apiVersion}/inventory")
            .WithTags("Inventory")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        // Literal /medicines/trash, /medicines/similar-names, /medicines/bulk before /medicines/{id:guid}.
        group.MapListTrashedMedicinesEndpoint();
        group.MapRestoreMedicineEndpoint();
        group.MapFindSimilarMedicineNamesEndpoint();
        group.MapFindDuplicateMedicinesEndpoint();
        group.MapGenerateMedicineBarcodeEndpoint();
        group.MapAddMedicineStockEndpoint();
        group.MapCreateMedicinesInBulkEndpoint();
        group.MapCreateMedicineEndpoint();
        group.MapUpdateMedicineEndpoint();
        group.MapDeleteMedicineEndpoint();
        group.MapGetMedicineByIdEndpoint();
        group.MapSearchMedicinesEndpoint();
        group.MapGetMedicineStatsEndpoint();
        group.MapCreateMedicineBatchRecallEndpoint();

        group.MapGetMedicinePriceHistoryEndpoint();
        group.MapCreateMedicinePriceScheduleEndpoint();
        group.MapCancelMedicinePriceScheduleEndpoint();

        group.MapSearchNepalMedicineCatalogEndpoint();

        group.MapCreateBatchEndpoint();
        group.MapAdjustBatchQuantityEndpoint();
        group.MapUpdateBatchSellingPriceEndpoint();
        group.MapVoidBatchEndpoint();
        group.MapGetBatchByIdEndpoint();
        group.MapSearchBatchesEndpoint();

        group.MapGetReorderSuggestionsEndpoint();
        group.MapGetExpiringBatchesEndpoint();
        group.MapGetExpiredBatchesEndpoint();
        group.MapGetDeadStockEndpoint();
        group.MapGetInventoryDiscrepancyReportEndpoint();
        group.MapGetTopSellingMedicinesEndpoint();
        group.MapGetCategoryPerformanceEndpoint();

        group.MapCreateConsignmentReceiptEndpoint();
        group.MapFinalizeConsignmentSettlementEndpoint();
        group.MapSearchConsignmentPositionsEndpoint();
        group.MapListConsignmentSettlementsEndpoint();

        group.MapSearchInventoryTransactionsEndpoint();

        group.MapStockCountEndpoints();

        // Literal /stock-transfers/{id}/receive|cancel before the bare list route matters less here
        // since none of these collide with a {id:guid} catch-all, but keep create before search for
        // readability (mirrors the Medicines section's literal-before-catch-all ordering).
        group.MapCreateStockTransferEndpoint();
        group.MapReceiveStockTransferEndpoint();
        group.MapCancelStockTransferEndpoint();
        group.MapSearchStockTransfersEndpoint();

        var jobManager = endpoints.ServiceProvider.GetService<IRecurringJobManager>();
        if (jobManager is not null)
        {
            // 18:20 UTC = 00:05 in Nepal: a price scheduled for a day is live from the start of that day.
            jobManager.AddOrUpdate<ApplyDueMedicinePriceSchedulesJob>(
                "inventory-apply-due-price-schedules",
                j => j.RunAsync(CancellationToken.None),
                "20 18 * * *",
                new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        }
    }
}
