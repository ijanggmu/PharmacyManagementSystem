using FSH.Framework.Shared.Persistence;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Refills;

/// <summary>Paged list of recorded prescription refills (filter by prescription, customer, medicine and
/// refilled-at date range).</summary>
public sealed record SearchPrescriptionRefillsQuery(
    Guid? PrescriptionId = null,
    Guid? CustomerId = null,
    Guid? MedicineId = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<PrescriptionRefillDto>>;
