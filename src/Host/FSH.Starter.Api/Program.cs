using FSH.Framework.Eventing;
using FSH.Framework.Web;
using FSH.Framework.Web.Modules;
using FSH.Starter.Api;
using FSH.Modules.Auditing;
using FSH.Modules.Identity;
using FSH.Modules.Identity.Contracts.v1.Tokens.TokenGeneration;
using FSH.Modules.Identity.Features.v1.Tokens.TokenGeneration;
using FSH.Modules.Multitenancy;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantStatus;
using FSH.Modules.Webhooks;
using FSH.Modules.Billing;
using FSH.Modules.Accounting;
using FSH.Modules.Catalog;
using FSH.Modules.Customers;
using FSH.Modules.Inventory;
using FSH.Modules.Prescriptions;
using FSH.Modules.Onboarding;
using FSH.Modules.Purchasing;
using FSH.Modules.Reference;
using FSH.Modules.Sales;
using FSH.Modules.Suppliers;
using FSH.Modules.Tickets;
using FSH.Modules.Multitenancy.Features.v1.GetTenantStatus;
using System.Reflection;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Serialize enums as string names (reads still accept names or integers). [Flags] enums (AuditTag, BodyCapture)
// opt back to numeric via their own NumericEnumConverter since comma-joined flag strings break bitwise consumers. Frontends mirror this as string unions.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

if (builder.Environment.IsProduction())
{
    static void Require(IConfiguration config, string key)
    {
        if (string.IsNullOrWhiteSpace(config[key]))
        {
            throw new InvalidOperationException($"Missing required configuration '{key}' in Production.");
        }
    }

    var config = builder.Configuration;
    Require(config, "DatabaseOptions:ConnectionString");
    Require(config, "CachingOptions:Redis");
    Require(config, "JwtOptions:SigningKey");
}

builder.Services.AddMediator(o =>
{
    o.ServiceLifetime = ServiceLifetime.Scoped;
    o.Assemblies = [
        typeof(GenerateTokenCommand),
        typeof(GenerateTokenCommandHandler),
        typeof(GetTenantStatusQuery),
        typeof(GetTenantStatusQueryHandler),
        typeof(FSH.Modules.Auditing.Contracts.AuditEnvelope),
        typeof(FSH.Modules.Auditing.Persistence.AuditDbContext),
        typeof(FSH.Modules.Webhooks.Contracts.v1.CreateWebhookSubscription.CreateWebhookSubscriptionCommand),
        typeof(FSH.Modules.Webhooks.WebhooksModule),
        typeof(FSH.Modules.Billing.Contracts.BillingContractsMarker),
        typeof(FSH.Modules.Billing.BillingModule),
        typeof(FSH.Modules.Catalog.Contracts.CatalogContractsMarker),
        typeof(FSH.Modules.Catalog.CatalogModule),
        typeof(FSH.Modules.Reference.Contracts.ReferenceContractsMarker),
        typeof(FSH.Modules.Reference.ReferenceModule),
        typeof(FSH.Modules.Accounting.Contracts.AccountingContractsMarker),
        typeof(FSH.Modules.Accounting.AccountingModule),
        typeof(FSH.Modules.Inventory.Contracts.InventoryContractsMarker),
        typeof(FSH.Modules.Inventory.InventoryModule),
        typeof(FSH.Modules.Purchasing.Contracts.PurchasingContractsMarker),
        typeof(FSH.Modules.Purchasing.PurchasingModule),
        typeof(FSH.Modules.Prescriptions.Contracts.PrescriptionsContractsMarker),
        typeof(FSH.Modules.Prescriptions.PrescriptionsModule),
        typeof(FSH.Modules.Sales.Contracts.SalesContractsMarker),
        typeof(FSH.Modules.Sales.SalesModule),
        typeof(FSH.Modules.Suppliers.Contracts.SuppliersContractsMarker),
        typeof(FSH.Modules.Suppliers.SuppliersModule),
        typeof(FSH.Modules.Customers.Contracts.CustomersContractsMarker),
        typeof(FSH.Modules.Customers.CustomersModule),
        typeof(FSH.Modules.Tickets.Contracts.TicketsContractsMarker),
        typeof(FSH.Modules.Tickets.TicketsModule),
        typeof(FSH.Modules.Files.Contracts.v1.Commands.RequestUploadUrlCommand),
        typeof(FSH.Modules.Files.FilesModule),
        typeof(FSH.Modules.Chat.Contracts.v1.Commands.CreateChannelCommand),
        typeof(FSH.Modules.Chat.ChatModule),
        typeof(FSH.Modules.Notifications.Contracts.v1.Commands.MarkNotificationReadCommand),
        typeof(FSH.Modules.Notifications.NotificationsModule),
        typeof(FSH.Modules.Onboarding.Contracts.OnboardingContractsMarker),
        typeof(FSH.Modules.Onboarding.OnboardingModule)];
});

var moduleAssemblies = new Assembly[]
{
    typeof(IdentityModule).Assembly,
    typeof(MultitenancyModule).Assembly,
    typeof(AuditingModule).Assembly,
    typeof(FSH.Modules.Files.FilesModule).Assembly,
    typeof(WebhooksModule).Assembly,
    typeof(BillingModule).Assembly,
    typeof(CatalogModule).Assembly,
    typeof(ReferenceModule).Assembly,
    typeof(AccountingModule).Assembly,
    typeof(InventoryModule).Assembly,
    typeof(PurchasingModule).Assembly,
    typeof(PrescriptionsModule).Assembly,
    typeof(SalesModule).Assembly,
    typeof(SuppliersModule).Assembly,
    typeof(CustomersModule).Assembly,
    typeof(TicketsModule).Assembly,
    typeof(FSH.Modules.Chat.ChatModule).Assembly,
    typeof(FSH.Modules.Notifications.NotificationsModule).Assembly,
    typeof(OnboardingModule).Assembly,
};

builder.AddHeroPlatform(o =>
{
    o.EnableCaching = true;
    o.EnableMailing = true;
    o.EnableJobs = true;
    o.EnableQuotas = true;
    o.EnableSse = true;
    o.EnableRealtime = true;
});

// The transactional outbox is framework infrastructure with exactly one owner
// (EventingDbContext), so the host registers it once for every module (issue #1349).
builder.Services.AddEventingCore(builder.Configuration);

builder.AddModules(moduleAssemblies);

// Trust X-Forwarded-For/Proto only from private networks (reverse proxy + the Next.js BFF), so the
// IP-keyed rate limiter and audit trail see the real client IP. See ForwardedHeadersSetup.
builder.Services.AddTrustedForwardedHeaders(builder.Configuration);

// Self-heal deployments carrying retired per-module `{module}-outbox-dispatcher` Hangfire recurring jobs
// (the outbox is now dispatched by OutboxDispatcherHostedService). No-op once the storage is clean.
builder.Services.AddHostedService<FSH.Starter.Api.OrphanedOutboxRecurringJobCleanupService>();

// Demo data is provisioned by the DbMigrator's `seed-demo` verb, not the API — the API never mutates data on startup.
// See src/Host/FSH.Starter.DbMigrator/README.md.

var app = builder.Build();

// Must run before anything that reads the client IP or scheme (rate limiting, auditing, HTTPS redirect).
app.UseForwardedHeaders();

app.UseHeroMultiTenantDatabases();
app.UseHeroPlatform(p =>
{
    p.MapModules = true;
    p.ServeStaticFiles = true;
    p.UseQuotas = true;
    p.MapSseEndpoints = true;
    p.MapRealtime = true;
});

app.MapGet("/", () => Results.Ok(new { message = "hello world!" }))
   .WithTags("PlayGround")
   .AllowAnonymous();

FSH.Starter.Api.Diagnostics.GetMigrationStatusEndpoint.MapGetMigrationStatusEndpoint(app);
FSH.Starter.Api.Diagnostics.GetJobsStatusEndpoint.MapGetJobsStatusEndpoint(app);

await app.RunAsync();