using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using Hangfire;
using Hangfire.Storage;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace FSH.Starter.Api.Diagnostics;

/// <summary>
/// Operator diagnostic: Hangfire's own monitoring view as JSON — totals, servers/workers, recurring
/// jobs (cron, next/last run, last state) and the most recent failures. The /health/ready "hangfire"
/// check only proves storage is reachable; this answers "are jobs actually running and succeeding?".
/// The built-in /jobs dashboard has the same data but sits behind separate Basic auth and is HTML.
///
/// Lives in the Host beside GetMigrationStatusEndpoint (composition-root diagnostics); root-only via
/// Tenants.View for the same reason — it describes the whole platform, not one tenant.
/// </summary>
internal static class GetJobsStatusEndpoint
{
    private const int RecentFailedCount = 10;
    private const int MaxMessageLength = 500;

    public static void MapGetJobsStatusEndpoint(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.MapGet("api/v1/system/jobs", Handle)
            .WithName("GetJobsStatus")
            .WithTags("System")
            .WithSummary("Hangfire job statistics, servers, recurring jobs and recent failures (operator diagnostic)")
            .RequirePermission(MultitenancyPermissions.Tenants.View);
    }

    internal static IResult Handle()
    {
        JobStorage storage;
        try
        {
            storage = JobStorage.Current;
        }
        catch (InvalidOperationException)
        {
            // EnableJobs is off — Hangfire never configured a storage.
            return TypedResults.Ok(JobsStatusDto.Disabled());
        }

#pragma warning disable CA1031 // Diagnostics must report a storage failure, not 500 on it.
        try
        {
            var monitor = storage.GetMonitoringApi();
            var stats = monitor.GetStatistics();

            var servers = monitor.Servers()
                .Select(s => new JobServerDto(s.Name, s.Queues?.ToList() ?? [], s.WorkersCount, s.StartedAt, s.Heartbeat))
                .ToList();

            List<RecurringJobStatusDto> recurring;
            using (var connection = storage.GetConnection())
            {
                recurring = connection.GetRecurringJobs()
                    .OrderBy(r => r.Id, StringComparer.Ordinal)
                    .Select(r => new RecurringJobStatusDto(
                        r.Id, r.Cron, r.Queue, r.NextExecution, r.LastExecution, r.LastJobState, Truncate(r.Error)))
                    .ToList();
            }

            var failed = monitor.FailedJobs(0, RecentFailedCount)
                .Select(kv => new FailedJobSummaryDto(
                    kv.Key,
                    kv.Value.Job is { } job ? $"{job.Type.Name}.{job.Method.Name}" : null,
                    kv.Value.ExceptionType,
                    Truncate(kv.Value.ExceptionMessage),
                    kv.Value.FailedAt))
                .ToList();

            var totals = new JobStatisticsDto(
                stats.Servers, stats.Queues, stats.Enqueued, stats.Scheduled, stats.Processing,
                stats.Succeeded, stats.Failed, stats.Deleted, stats.Recurring);

            return TypedResults.Ok(new JobsStatusDto(true, DateTime.UtcNow, totals, servers, recurring, failed, null));
        }
        catch (Exception ex)
        {
            return TypedResults.Ok(new JobsStatusDto(true, DateTime.UtcNow, null, [], [], [], Truncate(ex.Message)));
        }
#pragma warning restore CA1031
    }

    private static string? Truncate(string? value) =>
        value is null || value.Length <= MaxMessageLength ? value : string.Concat(value.AsSpan(0, MaxMessageLength), "…");
}

internal sealed record JobStatisticsDto(
    long Servers,
    long Queues,
    long Enqueued,
    long Scheduled,
    long Processing,
    long Succeeded,
    long Failed,
    long Deleted,
    long Recurring);

internal sealed record JobServerDto(string Name, IReadOnlyList<string> Queues, int WorkersCount, DateTime StartedAt, DateTime? Heartbeat);

internal sealed record RecurringJobStatusDto(
    string Id,
    string? Cron,
    string? Queue,
    DateTime? NextExecution,
    DateTime? LastExecution,
    string? LastJobState,
    string? Error);

internal sealed record FailedJobSummaryDto(string JobId, string? Job, string? ExceptionType, string? ExceptionMessage, DateTime? FailedAt);

internal sealed record JobsStatusDto(
    bool Enabled,
    DateTime? GeneratedAtUtc,
    JobStatisticsDto? Statistics,
    IReadOnlyList<JobServerDto> Servers,
    IReadOnlyList<RecurringJobStatusDto> RecurringJobs,
    IReadOnlyList<FailedJobSummaryDto> RecentFailed,
    string? Error)
{
    public static JobsStatusDto Disabled() => new(false, DateTime.UtcNow, null, [], [], [], null);
}
