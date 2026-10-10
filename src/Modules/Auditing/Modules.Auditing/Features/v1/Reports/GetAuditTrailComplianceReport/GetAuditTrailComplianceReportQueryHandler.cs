using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.Reports.GetAuditTrailComplianceReport;
using FSH.Modules.Auditing.Persistence;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace FSH.Modules.Auditing.Features.v1.Reports.GetAuditTrailComplianceReport;

/// <summary>
/// .NET port of the "audit" branch of the Next.js reference's <c>generateAuditTrailComplianceReport</c>.
/// See <see cref="GetAuditTrailComplianceReportQuery"/> for the EntityChange-scoping rationale.
/// </summary>
public sealed class GetAuditTrailComplianceReportQueryHandler(
    AuditDbContext dbContext,
    ILogger<GetAuditTrailComplianceReportQueryHandler> logger)
    : IQueryHandler<GetAuditTrailComplianceReportQuery, AuditTrailComplianceReportDto>
{
    /// <summary>
    /// Mirrors the Next.js source's <c>.limit(1000)</c> on the raw <c>audit_logs</c> query — the report
    /// is a bounded recent-activity snapshot, not an unbounded export.
    /// </summary>
    public const int MaxScannedLogs = 1000;

    /// <summary>Mirrors the source's <c>logs.slice(0, 100)</c> — only the most recent 100 rows are returned in full.</summary>
    public const int MaxReturnedLogs = 100;

    public async ValueTask<AuditTrailComplianceReportDto> Handle(
        GetAuditTrailComplianceReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var records = dbContext.AuditRecords
            .AsNoTracking()
            .Where(a => a.EventType == (int)AuditEventType.EntityChange);

        if (query.FromUtc.HasValue)
        {
            records = records.Where(a => a.OccurredAtUtc >= query.FromUtc.Value);
        }

        if (query.ToUtc.HasValue)
        {
            records = records.Where(a => a.OccurredAtUtc <= query.ToUtc.Value);
        }

        var scanned = await records
            .OrderByDescending(a => a.OccurredAtUtc)
            .Take(MaxScannedLogs)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var byAction = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var entries = new List<AuditTrailComplianceReportEntryDto>(Math.Min(scanned.Count, MaxReturnedLogs));

        for (var i = 0; i < scanned.Count; i++)
        {
            var record = scanned[i];
            var (table, key, operation) = ParsePayload(record.PayloadJson, record.Id, logger);

            if (!string.IsNullOrEmpty(operation))
            {
                byAction[operation] = byAction.TryGetValue(operation, out var count) ? count + 1 : 1;
            }

            if (i < MaxReturnedLogs)
            {
                entries.Add(new AuditTrailComplianceReportEntryDto(
                    record.Id,
                    record.OccurredAtUtc,
                    record.UserId,
                    record.UserName,
                    table,
                    key,
                    operation,
                    record.TenantId));
            }
        }

        return new AuditTrailComplianceReportDto(
            query.FromUtc,
            query.ToUtc,
            scanned.Count,
            byAction,
            // PHI tracking was already hardcoded to 0 in the Next.js source ("PHI tracking removed") —
            // kept as a constant here rather than invented.
            0,
            entries);
    }

    private static (string? Table, string? Key, string? Operation) ParsePayload(
        string payloadJson, Guid auditId, ILogger logger)
    {
        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            var root = document.RootElement;
            string? table = root.TryGetProperty("table", out var t) ? t.GetString() : null;
            string? key = root.TryGetProperty("key", out var k) ? k.GetString() : null;
            string? operation = root.TryGetProperty("operation", out var o) ? o.GetString() : null;
            return (table, key, operation);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Failed to parse audit payload JSON for record {AuditId}.", auditId);
            return (null, null, null);
        }
    }
}
