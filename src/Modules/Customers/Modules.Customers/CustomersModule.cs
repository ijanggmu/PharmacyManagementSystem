using Asp.Versioning;
using FSH.Framework.Eventing;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Services;
using FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;
using FSH.Modules.Customers.Features.v1.Customers.ImportCustomers;
using FSH.Modules.Customers.Features.v1.Customers.DeleteCustomer;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerByCode;
using FSH.Modules.Customers.Features.v1.Loyalty.AdjustLoyaltyPoints;
using FSH.Modules.Customers.Features.v1.Loyalty.GetCustomerLoyalty;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerById;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerSummary;
using FSH.Modules.Customers.Features.v1.Customers.ListTrashedCustomers;
using FSH.Modules.Customers.Features.v1.Customers.RestoreCustomer;
using FSH.Modules.Customers.Features.v1.Customers.SearchCustomers;
using FSH.Modules.Customers.Features.v1.Customers.UpdateCustomer;
using FSH.Modules.Customers.Features.v1.Ledger.GetArAgingReport;
using FSH.Modules.Customers.Features.v1.Ledger.GetReceivablesDue;
using FSH.Modules.Customers.Features.v1.Ledger.GetCustomerLedger;
using FSH.Modules.Customers.Features.v1.Ledger.RecordCustomerPayment;
using FSH.Modules.Customers.Features.v1.Ledger.VoidCustomerPayment;
using FSH.Modules.Customers.Features.v1.Reports.GetCustomerGrowth;
using FSH.Modules.Customers.Features.v1.Reports.GetTopCustomers;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Customers.CustomersModule), 845)]

namespace FSH.Modules.Customers;

public sealed class CustomersModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(CustomersPermissions.All);

        builder.Services.AddHeroDbContext<CustomersDbContext>();
        builder.Services.AddScoped<IDbInitializer, CustomersDbInitializer>();
        builder.Services.AddScoped<ICustomerReceiptNumberService, CustomerReceiptNumberService>();
        builder.Services.AddScoped<ICustomerCodeService, CustomerCodeService>();
        // Sales applies a sale's balance on account / loyalty redemption through this, inside its own
        // transaction, so credit-limit and points checks see every earlier sale (no stale balance).
        builder.Services.AddScoped<ICustomerSalePostingService, CustomerSalePostingService>();
        builder.Services.AddScoped<ICustomerCreditPermissionGuard, CustomerCreditPermissionGuard>();

        // Subscribe to cross-module integration events handled by this assembly (Sales' completed-sale
        // event drives AR posting for credit sales — see docs/pharmacy-modules-plan.md §2/§8).
        builder.Services.AddIntegrationEventHandlers(typeof(CustomersModule).Assembly);

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<CustomersDbContext>(
                name: "db:customers",
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
            .WithTags("Customers")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        // Literal /customers/trash and /customers/by-code before /customers/{id:guid}.
        group.MapListTrashedCustomersEndpoint();
        group.MapGetCustomerByCodeEndpoint();
        group.MapRestoreCustomerEndpoint();
        group.MapCreateCustomerEndpoint();
        group.MapCreateCustomerImportEndpoint();
        group.MapUpdateCustomerEndpoint();
        group.MapDeleteCustomerEndpoint();

        // Loyalty and ledger sub-resources before the bare GetById catch-all.
        group.MapGetCustomerLoyaltyEndpoint();
        group.MapAdjustLoyaltyPointsEndpoint();
        group.MapGetCustomerLedgerEndpoint();
        group.MapCreateCustomerPaymentEndpoint();
        group.MapVoidCustomerPaymentEndpoint();

        group.MapGetCustomerByIdEndpoint();
        group.MapGetCustomerSummaryEndpoint();
        group.MapSearchCustomersEndpoint();

        group.MapGetArAgingReportEndpoint();
        group.MapGetReceivablesDueEndpoint();
        group.MapGetCustomerGrowthEndpoint();
        group.MapGetTopCustomersEndpoint();
    }
}
