using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Returns;

/// <summary>
/// One line going back to the supplier. <paramref name="BatchId"/> names the exact lot being returned (e.g. a
/// recalled one); without it the stock is taken in expiry order. <paramref name="UnitCost"/> is IGNORED: the
/// line is valued at what the units that actually left cost (their batches' cost), so the supplier's account
/// and the books are credited with the real stock value. It stays for request-shape compatibility.
/// </summary>
public sealed record SupplierReturnItemInput(
    Guid MedicineId,
    decimal Quantity,
    decimal UnitCost,
    string ReturnReason,
    string? Notes = null,
    Guid? BatchId = null);

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
