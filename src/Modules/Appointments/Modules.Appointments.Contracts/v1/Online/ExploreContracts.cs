using FSH.Modules.Appointments.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Appointments.Contracts.v1.Online;

/// <summary>Anonymous: the doctors of every pharmacy listed on the public Explore page, with their bookable
/// sittings. Not tied to the request's tenant.</summary>
public sealed record GetExploreDoctorsQuery : IQuery<ExploreDto>;
