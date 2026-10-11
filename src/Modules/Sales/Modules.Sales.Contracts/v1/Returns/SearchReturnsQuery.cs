using FSH.Framework.Shared.Persistence;
using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Returns;

/// <summary>Searches customer returns (paged).</summary>
/// <remarks>
/// <para><c>Search</c>: return id prefix ("RET-XXXXXXXX"), returned sale id prefix or invoice number,
/// reason, notes, or customer name/phone.</para>
/// <para><c>FromDate</c>/<c>ToDate</c>: whole Nepal-time days, inclusive (on the return date).</para>
/// <para><c>SortBy</c>: <c>return_date</c> (default), <c>created_at</c>, <c>total_return_amount</c>,
/// <c>status</c>. <c>SortOrder</c>: <c>desc</c> (default) or <c>asc</c>.</para>
/// </remarks>
public sealed record SearchReturnsQuery(
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
    DateOnly? ToDate = null) : IQuery<PagedResponse<SaleReturnDto>>
{
    public static readonly IReadOnlyList<string> SortFields =
        ["return_date", "created_at", "total_return_amount", "status"];
}
