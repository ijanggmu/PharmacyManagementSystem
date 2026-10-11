using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Returns;

public sealed record SupplierReturnItemInput(
    Guid MedicineId,
    decimal Quantity,
    // Informational only (kept for compatibility): the debit note is valued at the cost of the lots that
    // actually leave stock, never at this figure.
    decimal UnitCost,
    string ReturnReason,
    string? Notes = null,
    // The lot going back (e.g. the expired or damaged one); null = oldest-expiring first.
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
    IReadOnlyList<SupplierReturnItemInput> Items,
    // The supplier's bill the goods came on (quoted on the debit note).
    string? SupplierInvoiceNumber = null,
    // The goods were bought on a VAT bill: reverse the input VAT on taxable lines at the pharmacy's rate.
    bool ReverseInputVat = true) : ICommand<Guid>;
