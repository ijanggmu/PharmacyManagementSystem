namespace FSH.Modules.Reference.Contracts.Dtos;

/// <summary>A license or registration with how long it has left (negative once expired).</summary>
public sealed record PharmacyLicenseDto(
    Guid Id,
    string LicenseType,
    string Label,
    string? Title,
    string Number,
    string? HolderName,
    DateOnly? IssuedOn,
    DateOnly ExpiresOn,
    string? Notes,
    int DaysLeft,
    string Status);
