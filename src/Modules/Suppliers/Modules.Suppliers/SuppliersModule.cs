using Asp.Versioning;
using FSH.Framework.Eventing;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.Services;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Features.v1.CostHistory.GetSupplierCostHistory;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetApAgingReport;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetPayablesDue;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierLedger;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierOpenBills;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierStatement;
using FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;
using FSH.Modules.Suppliers.Features.v1.Ledger.VoidSupplierPayment;
using FSH.Modules.Suppliers.Features.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Features.v1.PriceLists;
using FSH.Modules.Suppliers.Features.v1.Returns.CreateSupplierReturn;
using FSH.Modules.Suppliers.Features.v1.Returns.GetSupplierReturnById;
using FSH.Modules.Suppliers.Features.v1.Returns.SearchSupplierReturns;
using FSH.Modules.Suppliers.Features.v1.Suppliers.CreateSupplier;
using FSH.Modules.Suppliers.Features.v1.Suppliers.ImportSuppliers;
using FSH.Modules.Suppliers.Features.v1.Suppliers.DeleteSupplier;
using FSH.Modules.Suppliers.Features.v1.Suppliers.GetSupplierById;
using FSH.Modules.Suppliers.Features.v1.Suppliers.GetSupplierLookup;
using FSH.Modules.Suppliers.Features.v1.Suppliers.ListTrashedSuppliers;
using FSH.Modules.Suppliers.Features.v1.Suppliers.RestoreSupplier;
using FSH.Modules.Suppliers.Features.v1.Suppliers.SearchSuppliers;
using FSH.Modules.Suppliers.Features.v1.Suppliers.UpdateSupplier;
using FSH.Modules.Suppliers.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Suppliers.SuppliersModule), 840)]

namespace FSH.Modules.Suppliers;

public sealed class SuppliersModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(SuppliersPermissions.All);

        builder.Services.AddHeroDbContext<SuppliersDbContext>();
        builder.Services.AddScoped<IDbInitializer, SuppliersDbInitializer>();

        // Cross-module surface: Purchasing references only Modules.Suppliers.Contracts and
        // injects this interface to record AP ledger movements on receiving a purchase order.
        builder.Services.AddScoped<ISupplierLedgerService, SupplierLedgerService>();
        builder.Services.AddScoped<ISupplierDebitNoteNumberService, SupplierDebitNoteNumberService>();
        builder.Services.AddScoped<ISupplierPaymentNumberService, SupplierPaymentNumberService>();
        builder.Services.AddScoped<ISupplierLedgerPermissionGuard, SupplierLedgerPermissionGuard>();

        // Subscribe to cross-module integration events handled by this assembly (Purchasing's
        // received-order event drives AP ledger posting — see docs/pharmacy-modules-plan.md §2).
        builder.Services.AddIntegrationEventHandlers(typeof(SuppliersModule).Assembly);

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<SuppliersDbContext>(
                name: "db:suppliers",
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
            .MapGroup("api/v{version:apiVersion}")
            .WithTags("Suppliers")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        // Literal /suppliers/trash before /suppliers/{id:guid}.
        group.MapListTrashedSuppliersEndpoint();
        group.MapRestoreSupplierEndpoint();
        group.MapCreateSupplierEndpoint();
        group.MapCreateSupplierImportEndpoint();
        group.MapUpdateSupplierEndpoint();
        group.MapDeleteSupplierEndpoint();

        // Ledger sub-resource before the bare GetById catch-all.
        group.MapGetSupplierLedgerEndpoint();
        group.MapCreateSupplierPaymentEndpoint();
        group.MapVoidSupplierPaymentEndpoint();
        group.MapGetSupplierStatementEndpoint();
        group.MapGetSupplierOpenBillsEndpoint();
        group.MapGetSupplierCostHistoryEndpoint();

        // Literal /suppliers/price-lists/lookup and /suppliers/{id}/price-list before the bare GetById.
        group.MapSupplierPriceListEndpoints();

        // Literal /suppliers/returns/{returnId} before /suppliers/{supplierId:guid}.
        // Literal /suppliers/returns (all suppliers) before /suppliers/returns/{id}.
        group.MapExpiryClaimEndpoints();
        group.MapSearchAllSupplierReturnsEndpoint();
        group.MapGetSupplierReturnByIdEndpoint();
        group.MapCreateSupplierReturnEndpoint();
        group.MapSearchSupplierReturnsEndpoint();

        group.MapGetSupplierLookupEndpoint();
        group.MapGetSupplierByIdEndpoint();
        group.MapSearchSuppliersEndpoint();

        group.MapGetApAgingReportEndpoint();
        group.MapGetPayablesDueEndpoint();
    }
}
