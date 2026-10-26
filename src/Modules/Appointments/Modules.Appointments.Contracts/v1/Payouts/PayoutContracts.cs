using FSH.Framework.Shared.Persistence;
using FSH.Modules.Appointments.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Appointments.Contracts.v1.Payouts;

public sealed record GetDoctorBalanceQuery(Guid DoctorId) : IQuery<DoctorBalanceDto>;

/// <summary>Pays the doctor everything owed now (<see cref="GetDoctorBalanceQuery"/>) by <see cref="PaymentMethod"/>.</summary>
public sealed record PayDoctorCommand(Guid DoctorId, string PaymentMethod, string? Note = null) : ICommand<DoctorPayoutDto>;

public sealed record SearchDoctorPayoutsQuery(Guid? DoctorId = null, int PageNumber = 1, int PageSize = 50)
    : IQuery<PagedResponse<DoctorPayoutDto>>;
