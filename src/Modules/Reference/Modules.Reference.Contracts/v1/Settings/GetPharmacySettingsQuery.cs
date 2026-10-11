using FSH.Modules.Reference.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Settings;

public sealed record GetPharmacySettingsQuery : IQuery<PharmacySettingsDto>;
