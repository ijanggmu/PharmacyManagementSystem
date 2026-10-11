namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>Response of <c>SendIrdInvoiceCommand</c> — .NET port of the Next.js reference's POST
/// <c>/api/ird</c> success body (<c>{ saleId, invoiceNumber }</c>).</summary>
public sealed record SendIrdInvoiceResponseDto(Guid SaleId, Guid QueueItemId, string InvoiceNumber);

/// <summary>One recent failed IRD queue row, as surfaced by the Next.js reference's
/// <c>getSystemHealthForTenant</c> (system-diagnostics-service.ts).</summary>
public sealed record IrdFailedQueueItemDto(Guid Id, string? LastError, DateTime CreatedAtUtc);

/// <summary>
/// .NET port of the Next.js reference's <c>getSystemHealthForTenant</c> IRD section
/// (system-diagnostics-service.ts, served by the Next.js app's <c>/api/system-health</c> route — which,
/// despite the generic name, reports only IRD queue health, not infra liveness; see
/// <c>GetIrdQueueHealthQuery</c> remarks). Deliberate deviation from upstream: <see cref="PendingCount"/>
/// and <see cref="FailedCount"/> here are true counts (a <c>COUNT(*)</c> query), not upstream's
/// <c>.limit(50).length</c>, which silently caps the reported number at 50 even when more rows exist.
/// </summary>
public sealed record IrdQueueHealthDto(
    int PendingCount,
    int FailedCount,
    int SalesFailedCount,
    IReadOnlyList<IrdFailedQueueItemDto> RecentFailed);

/// <summary>
/// One row of the Next.js reference's <c>sales-register</c> (and <c>annex-13</c>) IRD report types
/// (<c>getIrdReportRows</c> in reports-service.ts). Serves both report types — their legacy field sets
/// are the same sales rows, just reordered/relabelled for the two CSV layouts (the frontend picks the
/// column order per type). <b>Faithfulness gap</b> — the ported <c>Sale</c> entity has no
/// <c>sale_number</c> and no separate stored tax breakdown (VAT is computed on-the-fly by Accounting
/// from posted vouchers, not persisted per-sale), so <see cref="TaxAmount"/> is always <c>null</c> here
/// rather than invented; <see cref="DiscountAmount"/> IS derivable (sum of each line's
/// <c>SaleItem.DiscountAmount</c>) and is included. <c>Customer</c> does carry phone/email, so those are
/// included unlike an earlier version of this DTO assumed.
/// </summary>
public sealed record IrdSalesRegisterRowDto(
    Guid SaleId,
    string? InvoiceNumber,
    DateTime SaleDateUtc,
    decimal TotalAmount,
    decimal? TaxAmount,
    decimal DiscountAmount,
    string PaymentMethod,
    string IrdStatus,
    Guid? CustomerId,
    string CustomerName,
    string? CustomerPhone,
    string? CustomerEmail,
    // VAT-exclusive value of the taxable lines and total of the VAT-exempt lines, so
    // TaxableAmount + TaxAmount + ExemptAmount = TotalAmount. Taken from the breakdown stored at sale
    // time; for older sales without one it is derived from the VAT (taxable = VAT ÷ rate). Null only when
    // the VAT itself is unknown.
    decimal? TaxableAmount = null,
    decimal? ExemptAmount = null);
