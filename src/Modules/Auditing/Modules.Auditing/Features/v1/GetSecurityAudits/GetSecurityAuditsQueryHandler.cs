using System.Text.Json;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.GetSecurityAudits;
using FSH.Modules.Auditing.Persistence;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using static FSH.Modules.Auditing.Persistence.AuditJsonbFunctions;

namespace FSH.Modules.Auditing.Features.v1.GetSecurityAudits;

public sealed class GetSecurityAuditsQueryHandler : IQueryHandler<GetSecurityAuditsQuery, IReadOnlyList<SecurityAuditSummaryDto>>
{
    private const int MaxPageSize = 200;
    private const int DefaultPageSize = 50;

    private readonly AuditDbContext _dbContext;
    private readonly ILogger<GetSecurityAuditsQueryHandler> _logger;

    public GetSecurityAuditsQueryHandler(AuditDbContext dbContext, ILogger<GetSecurityAuditsQueryHandler> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async ValueTask<IReadOnlyList<SecurityAuditSummaryDto>> Handle(GetSecurityAuditsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        IQueryable<AuditRecord> audits = _dbContext.AuditRecords
            .AsNoTracking()
            .Where(a => a.EventType == (int)AuditEventType.Security);

        if (query.FromUtc.HasValue)
        {
            audits = audits.Where(a => a.OccurredAtUtc >= query.FromUtc.Value);
        }

        if (query.ToUtc.HasValue)
        {
            audits = audits.Where(a => a.OccurredAtUtc <= query.ToUtc.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.UserId))
        {
            audits = audits.Where(a => a.UserId == query.UserId);
        }

        if (query.Action.HasValue && query.Action.Value != SecurityAction.None)
        {
            string actionValue = query.Action.Value.ToString();
            // PostgreSQL renders jsonb::text in canonical form with a space after the
            // colon ({"action": "Value"}), so the pattern must include that space.
            audits = audits.Where(a => a.PayloadJson != null &&
                EF.Functions.ILike(AsText(a.PayloadJson), $"%\"action\": \"{actionValue}\"%"));
        }

        // Cap server-side so an unpaged call can't materialize a tenant's whole audit history.
        var take = query.Take is >= 1 and <= MaxPageSize ? query.Take.Value : DefaultPageSize;
        var skip = query.Skip is > 0 ? query.Skip.Value : 0;

        var rows = await audits
            .OrderByDescending(a => a.OccurredAtUtc)
            .Skip(skip)
            .Take(take)
            .Select(a => new { a.Id, a.OccurredAtUtc, a.EventType, a.Severity, a.TenantId, a.UserId, a.UserName, a.TraceId, a.CorrelationId, a.RequestId, a.Source, a.Tags, a.PayloadJson })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.Select(a =>
        {
            var dto = new SecurityAuditSummaryDto
            {
                Id = a.Id,
                OccurredAtUtc = a.OccurredAtUtc,
                EventType = (AuditEventType)a.EventType,
                Severity = (AuditSeverity)a.Severity,
                TenantId = a.TenantId,
                UserId = a.UserId,
                UserName = a.UserName,
                TraceId = a.TraceId,
                CorrelationId = a.CorrelationId,
                RequestId = a.RequestId,
                Source = a.Source,
                Tags = (AuditTag)a.Tags
            };

            PopulateFromPayload(dto, a.PayloadJson);
            return dto;
        }).ToList();
    }

    /// <summary>
    /// Best-effort extraction of the security-specific fields from the jsonb payload. Done in
    /// memory (after the bounded Skip/Take materializes) rather than via SQL, since there is no
    /// existing path-extraction DB function registered for this column (only the ::text cast used
    /// for ILIKE search). Never throws: a malformed/legacy payload just yields a blank row.
    /// </summary>
    private void PopulateFromPayload(SecurityAuditSummaryDto dto, string? payloadJson)
    {
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return;
        }

        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            var root = doc.RootElement;

            if (root.TryGetProperty("action", out var actionEl) && actionEl.ValueKind == JsonValueKind.String)
            {
                dto.Action = actionEl.GetString();
            }

            if (root.TryGetProperty("reasonCode", out var reasonEl) && reasonEl.ValueKind == JsonValueKind.String)
            {
                dto.ReasonCode = reasonEl.GetString();
            }

            if (root.TryGetProperty("authMethod", out var authEl) && authEl.ValueKind == JsonValueKind.String)
            {
                dto.AuthMethod = authEl.GetString();
            }

            if (root.TryGetProperty("claimsSnapshot", out var claimsEl) && claimsEl.ValueKind == JsonValueKind.Object)
            {
                if (claimsEl.TryGetProperty("ip", out var ipEl) && ipEl.ValueKind == JsonValueKind.String)
                {
                    dto.Ip = ipEl.GetString();
                }

                if (claimsEl.TryGetProperty("userAgent", out var uaEl) && uaEl.ValueKind == JsonValueKind.String)
                {
                    dto.UserAgent = uaEl.GetString();
                }
            }
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse security audit payload for row {AuditId}.", dto.Id);
        }
    }
}