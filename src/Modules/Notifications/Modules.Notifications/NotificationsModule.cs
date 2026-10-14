using Asp.Versioning;
using FluentValidation;
using FSH.Framework.Eventing;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Notifications.Contracts.Authorization;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Features.v1.DeleteNotification;
using FSH.Modules.Notifications.Features.v1.GetUnreadCount;
using FSH.Modules.Notifications.Features.v1.ListNotifications;
using FSH.Modules.Notifications.Features.v1.MarkAllNotificationsRead;
using FSH.Modules.Notifications.Features.v1.MarkNotificationRead;
using FSH.Modules.Notifications.Features.v1.Sms;
using FSH.Modules.Notifications.Jobs;
using FSH.Modules.Notifications.Sms;
using FSH.Modules.Notifications.Sms.Providers;
using FSH.Framework.Web.HttpResilience;
using Hangfire;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

namespace FSH.Modules.Notifications;

/// <summary>
/// Notifications module: per-user inbox driven by integration events from other modules (operational
/// alerts, licence-expiry reminders). Module order 750; integration-event handler registration is
/// order-sensitive, so it stays ahead of any module that publishes to it during startup.
/// </summary>
public sealed class NotificationsModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(NotificationPermissions.All);

        builder.Services.AddHeroDbContext<NotificationsDbContext>();
        builder.Services.AddScoped<IDbInitializer, NotificationsDbInitializer>();
        builder.Services.AddValidatorsFromAssembly(typeof(NotificationsModule).Assembly);

        // SMS (Nepal gateways): per-tenant provider + encrypted token in SmsSettings; host-wide gateway URLs in the
        // "SmsOptions" section. Messages queue in SmsMessages and are sent by ProcessSmsQueueJob; the daily
        // SmsReminderScanJob queues automatic dues / refill reminders; SaleReceiptSmsHandler queues receipts.
        builder.Services.AddOptions<SmsOptions>().BindConfiguration(nameof(SmsOptions));
        builder.Services.AddHttpClient(HttpSmsProvider.HttpClientName)
            .AddHeroResilience(builder.Configuration);
        // Never re-POST a send: a retried request after a lost response would text the customer twice. The queue job
        // retries with backoff instead. (Options name of AddStandardResilienceHandler's pipeline: "{client}-standard".)
        builder.Services.PostConfigure<HttpStandardResilienceOptions>(
            $"{HttpSmsProvider.HttpClientName}-standard", o => o.Retry.DisableForUnsafeHttpMethods());
        builder.Services.AddSingleton<ISmsProvider, LogOnlySmsProvider>();
        builder.Services.AddSingleton<ISmsProvider, SparrowSmsProvider>();
        builder.Services.AddSingleton<ISmsProvider, AakashSmsProvider>();
        builder.Services.AddSingleton<SmsProviderResolver>();
        builder.Services.AddSingleton<SmsSecrets>();
        builder.Services.AddScoped<SmsComposer>();
        builder.Services.AddScoped<SmsDispatchTrigger>();
        builder.Services.TryAddSingleton(TimeProvider.System);

        // Subscribe to cross-module integration events handled by this assembly.
        builder.Services.AddIntegrationEventHandlers(typeof(NotificationsModule).Assembly);

        builder.Services.AddHealthChecks().AddDbContextCheck<NotificationsDbContext>(
            name: "db:notifications",
            failureStatus: HealthStatus.Unhealthy);
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        var versionSet = endpoints.NewApiVersionSet()
            .HasApiVersion(new ApiVersion(1))
            .ReportApiVersions()
            .Build();

        var group = endpoints.MapGroup("api/v{version:apiVersion}/notifications")
            .WithTags("Notifications")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        // Literal routes first; /{id:guid}/read and /{id:guid} are the param-routes and live last.
        group.MapListNotificationsEndpoint();              // GET /
        group.MapGetUnreadCountEndpoint();                 // GET /unread-count
        group.MapMarkAllNotificationsReadEndpoint();       // POST /read-all
        group.MapMarkNotificationReadEndpoint();           // POST /{id:guid}/read
        group.MapDeleteNotificationEndpoint();             // DELETE /{id:guid}

        // SMS: settings, test, log, retry, manual dues reminder (all literal /sms/... routes).
        group.MapGetSmsSettingsEndpoint();
        group.MapGetSmsStatusEndpoint();
        group.MapUpdateSmsSettingsEndpoint();
        group.MapSendTestSmsEndpoint();
        group.MapSearchSmsMessagesEndpoint();
        group.MapRetrySmsMessageEndpoint();
        group.MapSendDuesReminderEndpoint();

        var jobManager = endpoints.ServiceProvider.GetService<IRecurringJobManager>();
        if (jobManager is not null)
        {
            jobManager.AddOrUpdate<ProcessSmsQueueJob>(
                ProcessSmsQueueJob.JobId,
                j => j.RunAsync(CancellationToken.None),
                Cron.Minutely(),
                new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
            jobManager.AddOrUpdate<SmsReminderScanJob>(
                SmsReminderScanJob.JobId,
                j => j.RunAsync(CancellationToken.None),
                SmsReminderScanJob.Cron,
                new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        }
    }
}
