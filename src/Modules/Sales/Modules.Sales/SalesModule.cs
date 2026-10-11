using Asp.Versioning;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.HttpResilience;
using FSH.Framework.Web.Modules;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Features.v1.CashShifts.CloseCashShift;
using FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftById;
using FSH.Modules.Sales.Features.v1.CashShifts.GetBranchCashSummary;
using FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftSummary;
using FSH.Modules.Sales.Features.v1.CashShifts.GetCurrentCashShift;
using FSH.Modules.Sales.Features.v1.CashShifts.SearchCashShifts;
using FSH.Modules.Sales.Features.v1.CashShifts.StartCashShift;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdQueueHealth;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;
using FSH.Modules.Sales.Features.v1.Ird.SendIrdInvoice;
using FSH.Modules.Sales.Features.v1.Sales.RecordSalePrint;
using FSH.Modules.Sales.Features.v1.Reports.GetNarcoticRegister;
using FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;
using FSH.Modules.Sales.Features.v1.Refunds.DeleteRefund;
using FSH.Modules.Sales.Features.v1.Refunds.GetRefundById;
using FSH.Modules.Sales.Features.v1.Refunds.RecordRefundPrint;
using FSH.Modules.Sales.Features.v1.Refunds.GetRefundsStats;
using FSH.Modules.Sales.Features.v1.Refunds.SearchRefunds;
using FSH.Modules.Sales.Features.v1.Refunds.UpdateRefundStatus;
using FSH.Modules.Sales.Features.v1.Returns.CreateReturn;
using FSH.Modules.Sales.Features.v1.Returns.DeleteReturn;
using FSH.Modules.Sales.Features.v1.Returns.GetReturnById;
using FSH.Modules.Sales.Features.v1.Returns.GetReturnsStats;
using FSH.Modules.Sales.Features.v1.Returns.SearchReturns;
using FSH.Modules.Sales.Features.v1.Returns.UpdateReturnStatus;
using FSH.Modules.Sales.Features.v1.Sales.CancelSale;
using FSH.Modules.Sales.Features.v1.Sales.CreateSale;
using FSH.Modules.Sales.Features.v1.Sales.DeleteSale;
using FSH.Modules.Sales.Features.v1.Sales.GetSaleById;
using FSH.Modules.Sales.Features.v1.Sales.GetSalesStats;
using FSH.Modules.Sales.Features.v1.Sales.GetSalesSummary;
using FSH.Modules.Sales.Features.v1.Sales.SearchSales;
using FSH.Modules.Sales.Features.v1.Sales.UpdateSale;
using FSH.Modules.Sales.Jobs;
using FSH.Modules.Sales.Services;
using Hangfire;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Sales.SalesModule), 1050)]

namespace FSH.Modules.Sales;

public sealed class SalesModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(SalesPermissions.All);

        builder.Services.AddHeroDbContext<SalesDbContext>();
        builder.Services.AddScoped<IDbInitializer, SalesDbInitializer>();
        builder.Services.AddScoped<IInvoiceNumberService, InvoiceNumberService>();

        // IRD / CBMS dispatch. Per-tenant endpoint + credentials come from the "IrdOptions" section
        // (IrdOptions.Tenants, keyed by tenant identifier). A tenant with no entry gets a permanent failure.
        builder.Services.AddOptions<IrdOptions>().BindConfiguration(nameof(IrdOptions));
        builder.Services.AddHttpClient(HttpIrdDispatchClient.HttpClientName)
            .AddHeroResilience(builder.Configuration);
        builder.Services.AddSingleton<IIrdDispatchClient, HttpIrdDispatchClient>();

        // POS payment settings + Fonepay dynamic QR. Merchant credentials are per tenant (PaymentSettings),
        // encrypted with Data Protection.
        builder.Services.AddScoped<FSH.Modules.Sales.Features.v1.Payments.PaymentSecrets>();
        builder.Services.AddOptions<FonepayOptions>().BindConfiguration(nameof(FonepayOptions));
        builder.Services.AddHttpClient(HttpFonepayClient.HttpClientName);
        builder.Services.AddSingleton<IFonepayClient, HttpFonepayClient>();

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<SalesDbContext>(
                name: "db:sales",
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
            .MapGroup("api/v{version:apiVersion}/sales")
            .WithTags("Sales")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        // Literal /sales/stats and /sales/summary before /sales/{id:guid}.
        group.MapGetSalesStatsEndpoint();
        group.MapGetSalesSummaryEndpoint();
        group.MapCreateSaleEndpoint();
        group.MapVoidSaleEndpoint();
        group.MapGetSaleByIdEndpoint();
        group.MapCreateSalePrintEndpoint();
        group.MapUpdateSaleEndpoint();
        group.MapDeleteSaleEndpoint();
        group.MapSearchSalesEndpoint();

        // Literal /cash-shifts/current before /cash-shifts/{id:guid}.
        group.MapStartCashShiftEndpoint();
        group.MapGetCurrentCashShiftEndpoint();
        group.MapCloseCashShiftEndpoint();
        group.MapGetCashShiftSummaryEndpoint();
        group.MapGetBranchCashSummaryEndpoint();
        group.MapGetCashShiftByIdEndpoint();
        group.MapSearchCashShiftsEndpoint();

        // Literal /returns/stats before /returns/{returnId:guid}.
        group.MapGetReturnsStatsEndpoint();
        group.MapCreateReturnEndpoint();
        group.MapUpdateReturnStatusEndpoint();
        group.MapDeleteReturnEndpoint();
        group.MapGetReturnByIdEndpoint();
        group.MapSearchReturnsEndpoint();

        // Literal /refunds/stats before /refunds/{refundId:guid}.
        group.MapGetRefundsStatsEndpoint();
        group.MapCreateRefundEndpoint();
        group.MapUpdateRefundStatusEndpoint();
        group.MapDeleteRefundEndpoint();
        group.MapGetRefundByIdEndpoint();
        group.MapCreateRefundPrintEndpoint();
        group.MapSearchRefundsEndpoint();

        group.MapGetNarcoticRegisterEndpoint();

        group.MapSendIrdInvoiceEndpoint();
        group.MapGetIrdQueueHealthEndpoint();
        group.MapGetIrdSalesRegisterEndpoint();
        FSH.Modules.Sales.Features.v1.Ird.GetIrdQueue.GetIrdQueueEndpoint.MapGetIrdQueueEndpoint(group);

        FSH.Modules.Sales.Features.v1.Payments.PaymentEndpoints.MapPaymentEndpoints(group);

        // Recurring Hangfire job draining the IRD invoice queue — matches the pattern Files
        // (PurgeOrphanedFilesJob) and Billing (MonthlyInvoiceJob) use for module-registered recurring
        // jobs.
        var jobManager = endpoints.ServiceProvider.GetService<IRecurringJobManager>();
        if (jobManager is not null)
        {
            jobManager.AddOrUpdate<ProcessIrdInvoiceQueueJob>(
                "sales-process-ird-invoice-queue",
                j => j.RunAsync(CancellationToken.None),
                "*/5 * * * *", // every 5 minutes
                new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        }
    }
}
