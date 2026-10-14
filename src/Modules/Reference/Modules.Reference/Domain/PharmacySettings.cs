using FSH.Framework.Core.Domain;

namespace FSH.Modules.Reference.Domain;

/// <summary>
/// One row per tenant. Seeded on tenant provisioning (<see cref="Data.ReferenceDbInitializer"/>)
/// with defaults, then edited in place — never inserted a second time.
/// </summary>
public sealed class PharmacySettings : AggregateRoot<Guid>
{
    public string BusinessName { get; private set; } = default!;
    public string? BusinessAddress { get; private set; }
    public string? BusinessPhone { get; private set; }
    public string? BusinessEmail { get; private set; }
    public string CurrencyCode { get; private set; } = DefaultCurrencyCode;
    public decimal VatRatePercent { get; private set; }
    public string InvoiceNumberPrefix { get; private set; } = "INV";
    public int NextInvoiceSequence { get; private set; } = 1;
    public DateTime? UpdatedAtUtc { get; private set; }

    /// <summary>Nepal: the rupee, and the standard VAT rate. Whether an item is taxed is set per medicine
    /// (most medicines are VAT-exempt), so the rate only applies to items marked taxable.</summary>
    public const string DefaultCurrencyCode = "NPR";

    public const decimal DefaultVatRatePercent = 13m;

    private PharmacySettings() { }

    public static PharmacySettings CreateDefault(string businessName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(businessName);

        return new PharmacySettings
        {
            Id = Guid.CreateVersion7(),
            BusinessName = businessName.Trim(),
            CurrencyCode = DefaultCurrencyCode,
            VatRatePercent = DefaultVatRatePercent,
            InvoiceNumberPrefix = "INV",
            NextInvoiceSequence = 1,
        };
    }

    public void Update(
        string businessName,
        string? businessAddress,
        string? businessPhone,
        string? businessEmail,
        string currencyCode,
        decimal vatRatePercent,
        string invoiceNumberPrefix)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(businessName);
        ArgumentException.ThrowIfNullOrWhiteSpace(currencyCode);
        ArgumentException.ThrowIfNullOrWhiteSpace(invoiceNumberPrefix);
        if (vatRatePercent is < 0 or > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(vatRatePercent), vatRatePercent, "VAT rate must be between 0 and 100.");
        }

        BusinessName = businessName.Trim();
        BusinessAddress = businessAddress?.Trim();
        BusinessPhone = businessPhone?.Trim();
        BusinessEmail = businessEmail?.Trim();
        CurrencyCode = currencyCode.Trim().ToUpperInvariant();
        VatRatePercent = vatRatePercent;
        InvoiceNumberPrefix = invoiceNumberPrefix.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Atomically reserves and returns the next invoice number; caller is inside a transaction.</summary>
    public string ReserveNextInvoiceNumber()
    {
        int sequence = NextInvoiceSequence;
        NextInvoiceSequence++;
        UpdatedAtUtc = DateTime.UtcNow;
        return $"{InvoiceNumberPrefix}-{sequence:D6}";
    }
}
