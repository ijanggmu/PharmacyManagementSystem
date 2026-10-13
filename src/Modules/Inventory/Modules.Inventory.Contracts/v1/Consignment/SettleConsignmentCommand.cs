using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Consignment;

/// <summary>Settles every open consignment position for a supplier — pays for everything sold since
/// the last settlement. Rejected (409, via the handler) if there's nothing owed.</summary>
public sealed record SettleConsignmentCommand(
    Guid SupplierId,
    DateTime? SettlementDateUtc = null,
    // The supplier bills the settlement on a VAT bill: input VAT is charged on the taxable lots at the
    // pharmacy's rate (the same rule a supplier return uses to reverse it). False for a supplier who isn't
    // VAT-registered — the settlement is then the net cost only.
    bool SupplierChargesVat = true) : ICommand<Guid>;
