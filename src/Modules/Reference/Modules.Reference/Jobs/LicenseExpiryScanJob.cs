using System.Diagnostics;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.Events;
using FSH.Modules.Reference.Contracts.Licenses;
using FSH.Modules.Reference.Data;
using FSH.Modules.Reference.Domain;
using FSH.Modules.Reference.Features.v1.Licenses;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Reference.Jobs;

/// <summary>
/// Daily: for every tenant's licenses, raises a <see cref="LicenseExpiryReminderIntegrationEvent"/> on
/// the reminder days before expiry (<see cref="ReminderDays"/>) and once a week after it lapses, so the
/// people who can renew get a bell notification. Each license is reminded at most once a day
/// (<see cref="PharmacyLicense.LastReminderOn"/>).
///
/// Reads across tenants with <c>IgnoreQueryFilters()</c> and takes each row's tenant from its
/// Finbuckle shadow property, the same precedent as <c>ProcessIrdInvoiceQueueJob</c> (Sales) and
/// <c>PurgeOrphanedFilesJob</c> (Files) for the shared-database deployment.
/// </summary>
public sealed class LicenseExpiryScanJob(
    ReferenceDbContext dbContext,
    IOutboxWriter outbox,
    ILogger<LicenseExpiryScanJob> logger)
{
    /// <summary>Days before expiry on which a reminder goes out.</summary>
    public static readonly int[] ReminderDays = [60, 30, 14, 7, 3, 1, 0];

    /// <summary>True when a license with <paramref name="daysLeft"/> is due a reminder today.</summary>
    public static bool IsReminderDay(int daysLeft) =>
        daysLeft < 0 ? (-daysLeft) % 7 == 0 : ReminderDays.Contains(daysLeft);

    [AutomaticRetry(Attempts = 2)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var today = PharmacyLicenseMapper.NepalToday(DateTime.UtcNow);
        var horizon = today.AddDays(ReminderDays.Max());

        var candidates = await dbContext.PharmacyLicenses.IgnoreQueryFilters()
            .Where(l => l.ExpiresOn <= horizon && (l.LastReminderOn == null || l.LastReminderOn < today))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int sent = 0;
        foreach (var license in candidates)
        {
            int daysLeft = license.DaysLeft(today);
            if (!IsReminderDay(daysLeft))
            {
                continue;
            }

            string? tenantId = dbContext.Entry(license).Property("TenantId").CurrentValue as string;
            await outbox.AddAsync(new LicenseExpiryReminderIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: DateTime.UtcNow,
                TenantId: tenantId,
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: "Reference",
                LicenseId: license.Id,
                LicenseLabel: PharmacyLicenseTypes.Describe(license.LicenseType, license.Title),
                Number: license.Number,
                ExpiresOn: license.ExpiresOn,
                DaysLeft: daysLeft,
                NotifyPermission: ReferencePermissions.Settings.Update), cancellationToken).ConfigureAwait(false);

            license.MarkReminded(today);
            sent++;
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (sent > 0 && logger.IsEnabled(LogLevel.Information))
        {
            logger.LogInformation("License expiry scan raised {ReminderCount} reminders", sent);
        }
    }
}
