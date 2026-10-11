using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Consignment;

public sealed record GetConsignmentSettlementByIdQuery(Guid SettlementId) : IQuery<ConsignmentSettlementDto>;
