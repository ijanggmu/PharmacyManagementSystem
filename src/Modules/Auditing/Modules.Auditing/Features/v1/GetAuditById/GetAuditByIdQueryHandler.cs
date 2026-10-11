using FSH.Framework.Core.Context;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.GetAuditById;
using FSH.Modules.Auditing.Features.v1.Common;
using FSH.Modules.Auditing.Persistence;
using FSH.Modules.Identity.Contracts.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace FSH.Modules.Auditing.Features.v1.GetAuditById;

public sealed class GetAuditByIdQueryHandler : IQueryHandler<GetAuditByIdQuery, AuditDetailDto>
{
    private readonly AuditDbContext _dbContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUserPermissionService _permissions;
    private readonly ILogger<GetAuditByIdQueryHandler> _logger;

    public GetAuditByIdQueryHandler(
        AuditDbContext dbContext,
        ICurrentUser currentUser,
        IUserPermissionService permissions,
        ILogger<GetAuditByIdQueryHandler> logger)
    {
        _dbContext = dbContext;
        _currentUser = currentUser;
        _permissions = permissions;
        _logger = logger;
    }

    public async ValueTask<AuditDetailDto> Handle(GetAuditByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var audits = await AuditTenantScope
            .AuditRecordsAsync(_dbContext, _currentUser, _permissions, query.TenantId, cancellationToken)
            .ConfigureAwait(false);

        var record = await audits
            .FirstOrDefaultAsync(a => a.Id == query.Id, cancellationToken)
            .ConfigureAwait(false);

        if (record is null)
        {
            // KeyNotFoundException maps to 404 globally. Kept (not framework NotFoundException)
            // because audit exception-type fixtures and severity classification key off this type.
            throw new KeyNotFoundException($"Audit record {query.Id} not found.");
        }

        JsonElement payload;
        try
        {
            using var document = JsonDocument.Parse(record.PayloadJson);
            payload = document.RootElement.Clone();
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse audit payload JSON for record {AuditId}.", query.Id);
            payload = JsonDocument.Parse("{}").RootElement.Clone();
        }

        return new AuditDetailDto
        {
            Id = record.Id,
            OccurredAtUtc = record.OccurredAtUtc,
            ReceivedAtUtc = record.ReceivedAtUtc,
            EventType = (AuditEventType)record.EventType,
            Severity = (AuditSeverity)record.Severity,
            TenantId = record.TenantId,
            UserId = record.UserId,
            UserName = record.UserName,
            TraceId = record.TraceId,
            SpanId = record.SpanId,
            CorrelationId = record.CorrelationId,
            RequestId = record.RequestId,
            Source = record.Source,
            Tags = (AuditTag)record.Tags,
            Payload = payload
        };
    }
}