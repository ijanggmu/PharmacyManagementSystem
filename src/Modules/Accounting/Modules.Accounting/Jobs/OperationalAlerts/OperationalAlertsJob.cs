using System.Diagnostics;
using System.Security.Claims;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Accounting.Contracts.Alerts;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Users.GetUsers;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Hangfire;
using Mediator;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Accounting.Jobs.OperationalAlerts;

/// <summary>
/// Daily: per tenant, raises bell-notification digests for stock at or below its reorder level, batches near
/// expiry, and supplier bills / customer dues past the overdue age (<see cref="OperationalAlertSettings"/>).
///
/// <para><b>Who sees what.</b> A user gets a category only with the permissions in
/// <see cref="OperationalAlertRecipients"/> (managers and admins). The figures in their digest are the ones
/// they could open themselves: the reports are run in a scope that acts as that user, so the normal branch rule
/// applies (Branches.ViewAll users get every branch, everyone else their own). Users sharing a branch scope share
/// one computed digest — the reports run once per scope and category, not once per user.</para>
///
/// <para><b>No spam.</b> One <see cref="OperationalAlertRaisedIntegrationEvent"/> per category and scope goes
/// through the outbox; the Notifications module delivers it under <see cref="OperationalAlertDedupe"/> (one digest
/// per category a day, an unchanged list only every <c>alerts.repeat_days</c>). A retried or re-run job is therefore
/// harmless.</para>
///
/// <para>Hangfire runs this with no HTTP request, tenant or user: each tenant gets a fresh DI scope with its
/// Finbuckle context installed (the ApplyDueMedicinePriceSchedulesJob pattern), and one tenant's failure is
/// logged and does not stop the others.</para>
/// </summary>
public sealed partial class OperationalAlertsJob(
    IServiceScopeFactory scopeFactory,
    IMultiTenantStore<AppTenantInfo> tenantStore,
    TimeProvider timeProvider,
    ILogger<OperationalAlertsJob> logger)
{
    public const string JobId = "accounting-operational-alerts";

    /// <summary>00:30 UTC = 06:15 in Nepal, after the license scan: the digest is waiting when the pharmacy opens.</summary>
    public const string Cron = "30 0 * * *";

    private const string Source = "Accounting";

    [AutomaticRetry(Attempts = 1)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var tenants = await tenantStore.GetAllAsync().ConfigureAwait(false);
        DateTime nowUtc = timeProvider.GetUtcNow().UtcDateTime;

        int raised = 0;
        foreach (var tenant in tenants)
        {
            // The root tenant is the operator's console, with no pharmacy data of its own.
            if (!tenant.IsActive || string.Equals(tenant.Id, MultitenancyConstants.Root.Id, StringComparison.Ordinal))
            {
                continue;
            }

            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                raised += await ScanTenantAsync(tenant, nowUtc, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogTenantFailed(logger, ex, tenant.Id);
            }
        }

        LogFinished(logger, raised);
    }

    private async Task<int> ScanTenantAsync(AppTenantInfo tenant, DateTime nowUtc, CancellationToken ct)
    {
        using var tenantScope = CreateTenantScope(tenant);
        var mediator = tenantScope.ServiceProvider.GetRequiredService<IMediator>();

        var settingValues = await mediator.Send(new GetTenantSettingsQuery(OperationalAlertSettings.Category), ct).ConfigureAwait(false);
        var settings = OperationalAlertSettings.From(settingValues);
        if (!settings.Enabled)
        {
            return 0;
        }

        var permissionService = tenantScope.ServiceProvider.GetRequiredService<IUserPermissionService>();
        var users = await mediator.Send(new GetUsersQuery(), ct).ConfigureAwait(false);

        var digests = new Dictionary<(string Category, string Scope), OperationalAlertDigest?>();
        var recipients = new Dictionary<(string Category, string Scope), List<string>>();

        foreach (var user in users.Where(u => u.IsActive && !string.IsNullOrEmpty(u.Id)))
        {
            var permissions = await permissionService.GetPermissionsAsync(user.Id!, ct).ConfigureAwait(false);
            var categories = OperationalAlertRecipients.CategoriesFor(permissions);
            if (categories.Count == 0)
            {
                continue;
            }

            // Run the reports AS this user, so their branch scope (and nothing wider) applies.
            using var userScope = CreateTenantScope(tenant);
            userScope.ServiceProvider.GetRequiredService<ICurrentUserInitializer>()
                .SetCurrentUser(JobPrincipal(user.Id!, tenant.Id));
            Guid? branchId = await userScope.ServiceProvider.GetRequiredService<ICurrentBranch>()
                .ResolveListBranchFilterAsync(null, ct).ConfigureAwait(false);
            string scopeKey = OperationalAlertDedupe.ScopeKey(branchId);
            var userMediator = userScope.ServiceProvider.GetRequiredService<IMediator>();

            foreach (string category in categories)
            {
                var key = (category, scopeKey);
                if (!digests.TryGetValue(key, out var digest))
                {
                    digest = await BuildDigestAsync(userMediator, category, branchId, settings, nowUtc, ct).ConfigureAwait(false);
                    digests[key] = digest;
                }

                if (digest is not null)
                {
                    if (!recipients.TryGetValue(key, out var list))
                    {
                        recipients[key] = list = [];
                    }

                    list.Add(user.Id!);
                }
            }
        }

        if (recipients.Count == 0)
        {
            return 0;
        }

        // Publish from the tenant scope: its context decides which database the outbox row lands in.
        var outbox = tenantScope.ServiceProvider.GetRequiredService<IOutboxWriter>();
        DateOnly alertDate = NepalDate.FromUtc(nowUtc);
        foreach (var ((category, scopeKey), userIds) in recipients)
        {
            var digest = digests[(category, scopeKey)]!;
            await outbox.AddAsync(new OperationalAlertRaisedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: nowUtc,
                TenantId: tenant.Id,
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: Source,
                Category: category,
                ScopeKey: scopeKey,
                AlertDate: alertDate,
                Signature: digest.Signature,
                RepeatAfterDays: settings.RepeatAfterDays,
                Title: digest.Title,
                Body: digest.Body,
                Link: digest.Link,
                ItemCount: digest.ItemCount,
                RecipientUserIds: userIds), ct).ConfigureAwait(false);
        }

        return recipients.Count;
    }

    /// <summary>Runs the one report a category needs and turns it into a digest (null = nothing to report).</summary>
    public static async Task<OperationalAlertDigest?> BuildDigestAsync(
        IMediator mediator, string category, Guid? branchId, OperationalAlertSettings settings, DateTime nowUtc, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(mediator);
        ArgumentNullException.ThrowIfNull(settings);

        switch (category)
        {
            case OperationalAlertCategories.LowStock:
                var reorder = await mediator.Send(new GetReorderSuggestionsQuery(branchId), ct).ConfigureAwait(false);
                return OperationalAlertDigests.LowStock(reorder);
            case OperationalAlertCategories.ExpiringBatches:
                var expiring = await mediator.Send(new GetExpiringBatchesQuery(settings.ExpiryDays, branchId), ct).ConfigureAwait(false);
                return OperationalAlertDigests.ExpiringBatches(expiring, settings.ExpiryDays);
            case OperationalAlertCategories.PayablesOverdue:
                var ap = await mediator.Send(new GetApAgingReportQuery(nowUtc, branchId), ct).ConfigureAwait(false);
                return OperationalAlertDigests.PayablesOverdue(ap, settings.OverdueDays);
            case OperationalAlertCategories.ReceivablesOverdue:
                var ar = await mediator.Send(new GetArAgingReportQuery(nowUtc, branchId), ct).ConfigureAwait(false);
                return OperationalAlertDigests.ReceivablesOverdue(ar, settings.OverdueDays);
            default:
                return null;
        }
    }

    /// <summary>
    /// The identity the job's per-user scope runs under: just the user id and tenant, authenticated so that
    /// ICurrentBranch resolves that user's branch and Branches.ViewAll permission. It is never issued as a token
    /// and only ever drives read queries.
    /// </summary>
    public static ClaimsPrincipal JobPrincipal(string userId, string tenantId) =>
        new(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(CustomClaims.Tenant, tenantId)],
            authenticationType: nameof(OperationalAlertsJob)));

    private IServiceScope CreateTenantScope(AppTenantInfo tenant)
    {
        var scope = scopeFactory.CreateScope();
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        return scope;
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Operational alerts scan failed for tenant {TenantId}")]
    private static partial void LogTenantFailed(ILogger logger, Exception exception, string? tenantId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Operational alerts scan raised {DigestCount} digest event(s)")]
    private static partial void LogFinished(ILogger logger, int digestCount);
}
