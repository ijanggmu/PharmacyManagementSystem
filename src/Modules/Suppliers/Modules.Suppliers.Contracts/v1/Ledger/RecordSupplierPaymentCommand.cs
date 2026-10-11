using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

/// <summary>
/// Records a payment made to the supplier, reducing the payable balance. Accounting posts the
/// Dr Accounts Payable / Cr Cash|Bank voucher from <c>SupplierPaymentRecordedIntegrationEvent</c>.
/// <para><c>PaymentMethod</c> (optional, default cash) picks the GL money account Accounting credits:
/// cash → Cash, anything else → Bank.</para>
/// <para><c>BillReferenceType</c> / <c>BillReferenceId</c> (optional) pay one bill only — take them from
/// <c>GET /suppliers/{id}/open-bills</c>. The amount may not exceed that bill's outstanding. Without them the
/// payment settles the oldest open bills first.</para>
/// </summary>
public sealed record RecordSupplierPaymentCommand(
    Guid SupplierId,
    decimal Amount,
    DateTime PaymentDateUtc,
    string? Description = null,
    string? PaymentMethod = null,
    string? BillReferenceType = null,
    Guid? BillReferenceId = null) : ICommand<Guid>;
