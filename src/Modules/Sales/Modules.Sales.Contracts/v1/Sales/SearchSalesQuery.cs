using FSH.Framework.Shared.Persistence;
using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>Searches sales (paged), optionally filtered by customer/status/date range/branch/cashier.
/// When <c>OnlyWithBalanceDue</c> is true, only sales with a balance still owed (<c>BalanceDue &gt; 0</c>)
/// are returned — a customer's "open invoices" (unpaid/partially-paid credit sales), ordered oldest-first
/// so the longest-outstanding balance surfaces first.</summary>
/// <remarks>
/// <para><c>Search</c>: invoice number, sale id prefix (the "SALE-XXXXXXXX" label), notes, or customer
/// name/phone (resolved through Customers.Contracts).</para>
/// <para><c>PaymentStatuses</c> (any of): <c>paid</c>/<c>completed</c> (no balance due), <c>pending</c>
/// (balance due), <c>refunded</c> (has a completed refund), <c>cancelled</c>. Paid and pending exclude
/// cancelled sales. <c>failed</c> has no .NET counterpart and matches nothing.</para>
/// <para><c>PaymentMethods</c> (any of): a tender method or <c>mixed</c>. A specific method also matches
/// split-tender sales with a leg of that method.</para>
/// <para><c>MinAmount</c>/<c>MaxAmount</c>: inclusive bounds on the sale total (sum of line totals).</para>
/// <para><c>FromDate</c>/<c>ToDate</c>: whole Nepal-time (UTC+05:45) days, both inclusive. They combine
/// with <c>DateFromUtc</c>/<c>DateToUtc</c>, which remain exact UTC instants.</para>
/// <para><c>MedicineId</c>: only sales with at least one line of that medicine.</para>
/// <para><c>SortBy</c>: <c>sale_date</c> (default), <c>created_at</c>, <c>total_amount</c>,
/// <c>invoice_number</c>, <c>balance_due</c>. <c>SortOrder</c>: <c>desc</c> (default) or <c>asc</c>.</para>
/// </remarks>
public sealed record SearchSalesQuery(
    Guid? CustomerId = null,
    string? Status = null,
    DateTime? DateFromUtc = null,
    DateTime? DateToUtc = null,
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50,
    Guid? CashierUserId = null,
    bool OnlyWithBalanceDue = false,
    string? Search = null,
    IReadOnlyList<string>? PaymentStatuses = null,
    IReadOnlyList<string>? PaymentMethods = null,
    decimal? MinAmount = null,
    decimal? MaxAmount = null,
    string? SortBy = null,
    string? SortOrder = null,
    DateOnly? FromDate = null,
    DateOnly? ToDate = null,
    Guid? MedicineId = null) : IQuery<PagedResponse<SaleDto>>
{
    public static readonly IReadOnlyList<string> SortFields =
        ["sale_date", "created_at", "total_amount", "invoice_number", "balance_due"];

    public static readonly IReadOnlyList<string> PaymentStatusValues =
        ["paid", "completed", "pending", "failed", "refunded", "cancelled"];
}
