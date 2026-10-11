using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.Licenses;
using FSH.Modules.Reference.Domain;

namespace FSH.Modules.Reference.Features.v1.Licenses;

internal static class PharmacyLicenseMapper
{
    public static PharmacyLicenseDto ToDto(this PharmacyLicense l, DateOnly today)
    {
        int daysLeft = l.DaysLeft(today);
        return new PharmacyLicenseDto(
            l.Id, l.LicenseType, PharmacyLicenseTypes.Describe(l.LicenseType, l.Title), l.Title, l.Number, l.HolderName,
            l.IssuedOn, l.ExpiresOn, l.Notes, daysLeft, PharmacyLicenseStatus.For(daysLeft));
    }

    /// <summary>"Today" in Nepal (UTC+5:45), which is when a license actually lapses for the pharmacy.</summary>
    public static DateOnly NepalToday(DateTime utcNow) =>
        DateOnly.FromDateTime(utcNow.AddHours(5).AddMinutes(45));
}
