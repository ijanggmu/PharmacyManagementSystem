using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Consignment;

/// <summary>Settles every open consignment position for a supplier — pays for everything sold since
/// the last settlement. Rejected (409, via the handler) if there's nothing owed.</summary>
public sealed record SettleConsignmentCommand(Guid SupplierId, DateTime? SettlementDateUtc = null) : ICommand<Guid>;
