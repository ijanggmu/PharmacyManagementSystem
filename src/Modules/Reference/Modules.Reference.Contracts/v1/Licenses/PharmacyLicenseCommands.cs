using FSH.Modules.Reference.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Licenses;

/// <summary>The pharmacy's licenses, soonest expiry first.</summary>
public sealed record ListPharmacyLicensesQuery : IQuery<List<PharmacyLicenseDto>>;

public sealed record CreatePharmacyLicenseCommand(
    string LicenseType,
    string Number,
    DateOnly ExpiresOn,
    string? Title = null,
    string? HolderName = null,
    DateOnly? IssuedOn = null,
    string? Notes = null) : ICommand<Guid>;

public sealed record UpdatePharmacyLicenseCommand(
    Guid Id,
    string LicenseType,
    string Number,
    DateOnly ExpiresOn,
    string? Title = null,
    string? HolderName = null,
    DateOnly? IssuedOn = null,
    string? Notes = null) : ICommand<Guid>;

public sealed record DeletePharmacyLicenseCommand(Guid Id) : ICommand<Guid>;
