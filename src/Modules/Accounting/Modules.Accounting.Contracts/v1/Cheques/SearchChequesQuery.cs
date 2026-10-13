using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Cheques;

/// <summary>
/// The cheque register. <c>Status</c>/<c>Direction</c> take the <see cref="ChequeValues"/> wire values; the date range
/// filters on the cheque date. <c>DueOnly</c> lists the cheques that need action today: received cheques still on
/// hand and issued cheques not yet cleared whose cheque date is on or before <c>AsOfUtc</c> (now when omitted).
/// <c>Search</c> matches the party name or the cheque number.
/// </summary>
public sealed record SearchChequesQuery(
    string? Status = null,
    string? Direction = null,
    DateTime? ChequeDateFromUtc = null,
    DateTime? ChequeDateToUtc = null,
    bool DueOnly = false,
    DateTime? AsOfUtc = null,
    string? Search = null,
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<ChequeDto>>;

/// <summary>One cheque with its status history.</summary>
public sealed record GetChequeByIdQuery(Guid Id) : IQuery<ChequeDto>;
