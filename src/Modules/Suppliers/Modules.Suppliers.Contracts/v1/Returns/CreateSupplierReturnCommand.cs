using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Returns;

public sealed record SupplierReturnItemInput(
    Guid MedicineId,
    decimal Quantity,
    decimal UnitCost,
    string ReturnReason,
    string? Notes = null);

/// <summary>
/// Records goods returned to a supplier. Ports <c>createSupplierReturnForTenant</c>
/// (lib/server/services/supplier-return-service.ts): the handler caps each line at what was ever
/// actually received from this supplier for that medicine minus what's already been returned (only
/// when receipt history exists), deducts on-hand stock, and credits the AP ledger — see
/// <c>CreateSupplierReturnCommandHandler</c>.
/// </summary>
public sealed record CreateSupplierReturnCommand(
    Guid SupplierId,
    DateTime ReturnDateUtc,
    string? Notes,
    IReadOnlyList<SupplierReturnItemInput> Items) : ICommand<Guid>;
