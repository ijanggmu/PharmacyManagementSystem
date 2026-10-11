using FSH.Framework.Core.Domain;

namespace FSH.Modules.Reference.Domain;

/// <summary>
/// A license or registration the pharmacy must renew (DDA license, pharmacist registration, PAN/VAT,
/// …), with its expiry. <see cref="LastReminderOn"/> records the last day a reminder went out, so the
/// daily scan sends each reminder once.
/// </summary>
public sealed class PharmacyLicense : AggregateRoot<Guid>
{
    public string LicenseType { get; private set; } = default!;
    public string? Title { get; private set; }
    public string Number { get; private set; } = default!;
    public string? HolderName { get; private set; }
    public DateOnly? IssuedOn { get; private set; }
    public DateOnly ExpiresOn { get; private set; }
    public string? Notes { get; private set; }
    public DateOnly? LastReminderOn { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private PharmacyLicense() { }

    public static PharmacyLicense Create(
        string licenseType, string number, DateOnly expiresOn, string? title, string? holderName, DateOnly? issuedOn, string? notes)
    {
        var license = new PharmacyLicense { Id = Guid.CreateVersion7(), CreatedAtUtc = DateTime.UtcNow };
        license.Apply(licenseType, number, expiresOn, title, holderName, issuedOn, notes);
        return license;
    }

    public void Update(
        string licenseType, string number, DateOnly expiresOn, string? title, string? holderName, DateOnly? issuedOn, string? notes)
    {
        // A renewal (new expiry) starts the reminders over.
        if (expiresOn != ExpiresOn)
        {
            LastReminderOn = null;
        }

        Apply(licenseType, number, expiresOn, title, holderName, issuedOn, notes);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkReminded(DateOnly on) => LastReminderOn = on;

    public int DaysLeft(DateOnly today) => ExpiresOn.DayNumber - today.DayNumber;

    private void Apply(
        string licenseType, string number, DateOnly expiresOn, string? title, string? holderName, DateOnly? issuedOn, string? notes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(licenseType);
        ArgumentException.ThrowIfNullOrWhiteSpace(number);
        if (issuedOn is { } issued && issued > expiresOn)
        {
            throw new ArgumentException("A license can't expire before it was issued.", nameof(expiresOn));
        }

        LicenseType = licenseType.Trim();
        Number = number.Trim();
        ExpiresOn = expiresOn;
        Title = string.IsNullOrWhiteSpace(title) ? null : title.Trim();
        HolderName = string.IsNullOrWhiteSpace(holderName) ? null : holderName.Trim();
        IssuedOn = issuedOn;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
    }
}
