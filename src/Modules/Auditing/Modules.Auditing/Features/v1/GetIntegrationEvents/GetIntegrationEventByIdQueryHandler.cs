using System.Text.Json;
using System.Text.Json.Nodes;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Persistence;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.Authorization;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.GetIntegrationEvents;
using FSH.Modules.Auditing.Features.v1.Common;
using FSH.Modules.Identity.Contracts.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Auditing.Features.v1.GetIntegrationEvents;

/// <summary>
/// One outbox event in full: dispatch state, the (masked) JSON payload, and the inbox rows showing
/// which handlers consumed it and when. A row from another tenant is reported as not found unless
/// the caller holds <c>Permissions.AuditTrails.ViewCrossTenant</c>.
/// </summary>
public sealed class GetIntegrationEventByIdQueryHandler : IQueryHandler<GetIntegrationEventByIdQuery, IntegrationEventDetailDto>
{
    private readonly EventingDbContext _dbContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUserPermissionService _permissions;
    private readonly IAuditMaskingService _masking;
    private readonly ILogger<GetIntegrationEventByIdQueryHandler> _logger;

    public GetIntegrationEventByIdQueryHandler(
        EventingDbContext dbContext,
        ICurrentUser currentUser,
        IUserPermissionService permissions,
        IAuditMaskingService masking,
        ILogger<GetIntegrationEventByIdQueryHandler> logger)
    {
        _dbContext = dbContext;
        _currentUser = currentUser;
        _permissions = permissions;
        _masking = masking;
        _logger = logger;
    }

    public async ValueTask<IntegrationEventDetailDto> Handle(GetIntegrationEventByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var message = await _dbContext.OutboxMessages
            .AsNoTracking()
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.Id == query.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Integration event {query.Id} not found.");

        var currentTenant = _currentUser.GetTenant();
        if (!string.Equals(message.TenantId, currentTenant, StringComparison.OrdinalIgnoreCase))
        {
            var allowed = await _permissions
                .HasPermissionAsync(_currentUser.GetUserId().ToString(), AuditingPermissions.AuditTrails.ViewCrossTenant, cancellationToken)
                .ConfigureAwait(false);
            if (!allowed)
            {
                // Don't leak the existence of another tenant's event.
                throw new NotFoundException($"Integration event {query.Id} not found.");
            }
        }

        var consumers = await _dbContext.InboxMessages
            .AsNoTracking()
            .IgnoreQueryFilters()
            .Where(i => i.Id == query.Id)
            .OrderBy(i => i.ProcessedOnUtc)
            .Select(i => new { i.HandlerName, i.ProcessedOnUtc })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new IntegrationEventDetailDto
        {
            Id = message.Id,
            CreatedOnUtc = message.CreatedOnUtc,
            Type = message.Type,
            ShortType = ClrTypeNames.ToShortName(message.Type),
            Module = ClrTypeNames.ModuleOf(message.Type),
            TenantId = message.TenantId,
            CorrelationId = message.CorrelationId,
            ProcessedOnUtc = message.ProcessedOnUtc,
            RetryCount = message.RetryCount,
            LastError = message.LastError,
            IsDead = message.IsDead,
            NextRetryAt = message.NextRetryAt,
            ClaimedUntilUtc = message.ClaimedUntilUtc,
            ClaimedBy = message.ClaimedBy,
            Status = GetIntegrationEventsQueryHandler.DeriveStatus(message.IsDead, message.ProcessedOnUtc, message.LastError),
            Payload = ParsePayload(message.Id, message.Payload),
            Consumers = consumers
                .Select(c => new IntegrationEventConsumerDto
                {
                    HandlerName = c.HandlerName,
                    HandlerShortName = ClrTypeNames.ToShortName(c.HandlerName, stripIntegrationEventSuffix: false),
                    Module = ClrTypeNames.ModuleOf(c.HandlerName),
                    ProcessedOnUtc = c.ProcessedOnUtc,
                })
                .ToList(),
        };
    }

    private JsonElement ParsePayload(Guid id, string? payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return JsonDocument.Parse("{}").RootElement.Clone();
        }

        try
        {
            var node = JsonNode.Parse(payload);
            if (node is null)
            {
                return JsonDocument.Parse("{}").RootElement.Clone();
            }

            var masked = _masking.ApplyMasking(node).Payload;
            return JsonSerializer.SerializeToElement(masked);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse outbox payload for integration event {EventId}.", id);
            return JsonSerializer.SerializeToElement(new { raw = payload.Length > 4_000 ? payload[..4_000] : payload });
        }
    }
}
