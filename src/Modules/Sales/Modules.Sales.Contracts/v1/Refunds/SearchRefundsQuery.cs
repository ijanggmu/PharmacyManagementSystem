using FSH.Framework.Shared.Persistence;
using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Refunds;

/// <summary>Searches refunds (paged).</summary>
/// <remarks>
/// <para><c>Search</c>: refund number, credit-note number, original sale invoice number or id prefix,
/// reason, notes, or customer name/phone.</para>
/// <para><c>MinAmount</c>/<c>MaxAmount</c>: inclusive bounds on the net refund amount.</para>
/// <para><c>FromDate</c>/<c>ToDate</c>: whole Nepal-time days, inclusive (on the refund date).</para>
/// <para><c>SortBy</c>: <c>refund_date</c> (default), <c>created_at</c>, <c>net_refund_amount</c>
/// (alias <c>refund_amount</c>), <c>refund_number</c>, <c>status</c>. <c>SortOrder</c>: <c>desc</c>
/// (default) or <c>asc</c>.</para>
/// </remarks>
public sealed record SearchRefundsQuery(
    Guid? CustomerId = null,
    Guid? SaleId = null,
    string? Status = null,
    DateTime? DateFromUtc = null,
    DateTime? DateToUtc = null,
    decimal? MinAmount = null,
    decimal? MaxAmount = null,
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50,
    string? Search = null,
    string? SortBy = null,
    string? SortOrder = null,
    DateOnly? FromDate = null,
    DateOnly? ToDate = null) : IQuery<PagedResponse<SaleRefundDto>>
{
    public static readonly IReadOnlyList<string> SortFields =
        ["refund_date", "created_at", "net_refund_amount", "refund_amount", "refund_number", "status"];
}
