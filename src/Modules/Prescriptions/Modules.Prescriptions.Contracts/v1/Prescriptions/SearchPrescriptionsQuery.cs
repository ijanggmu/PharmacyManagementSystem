using FSH.Framework.Shared.Persistence;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

/// <summary>
/// Paged prescription search. <see cref="Search"/> matches the prescription number, the prescriber, or the
/// patient's name, phone or email.
/// </summary>
public sealed record SearchPrescriptionsQuery(
    Guid? CustomerId = null,
    IReadOnlyList<string>? Statuses = null,
    int PageNumber = 1,
    int PageSize = 50,
    Guid? CreatedByUserId = null,
    string? Search = null,
    DateOnly? DateFrom = null,
    DateOnly? DateTo = null) : IQuery<PagedResponse<PrescriptionDto>>;
