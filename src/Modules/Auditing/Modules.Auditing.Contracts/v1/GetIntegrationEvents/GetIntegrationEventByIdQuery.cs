using FSH.Modules.Auditing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Auditing.Contracts.v1.GetIntegrationEvents;

/// <summary>One outbox integration event with its payload and inbox consumers.</summary>
public sealed record GetIntegrationEventByIdQuery(Guid Id) : IQuery<IntegrationEventDetailDto>;
