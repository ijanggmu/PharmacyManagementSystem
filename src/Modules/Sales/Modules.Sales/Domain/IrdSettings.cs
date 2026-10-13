using FSH.Framework.Core.Domain;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// One row per tenant: the IRD (Nepal Inland Revenue Department) CBMS e-billing connection — whether bills are
/// reported, the CBMS base URL (null = the configured default, IRD's test server), the API user issued by IRD, the
/// seller's PAN, and the abbreviated-tax-invoice threshold. The CBMS password is stored already encrypted (Data
/// Protection, <c>IrdSecrets</c>); this entity never sees it in plain text, and it is never logged or returned.
/// </summary>
public sealed class IrdSettings : AggregateRoot<Guid>
{
    /// <summary>IRD's limit for an abbreviated tax invoice when the buyer gives no PAN (NPR).</summary>
    public const decimal DefaultAbbreviatedInvoiceThreshold = 10_000m;

    public bool Enabled { get; private set; }

    /// <summary>CBMS base URL, e.g. <c>https://cbapi.ird.gov.np</c>. Null uses <c>IrdOptions.DefaultBaseUrl</c>.</summary>
    public string? BaseUrl { get; private set; }

    public string? Username { get; private set; }
    public string? PasswordProtected { get; private set; }

    /// <summary>The pharmacy's own PAN / VAT number (CBMS <c>seller_pan</c>).</summary>
    public string? SellerPan { get; private set; }

    /// <summary>Sales up to this amount without a buyer PAN print as an Abbreviated Tax Invoice.</summary>
    public decimal AbbreviatedInvoiceThreshold { get; private set; } = DefaultAbbreviatedInvoiceThreshold;

    public DateTime UpdatedAtUtc { get; private set; }

    private IrdSettings() { }

    public static IrdSettings CreateDefault() => new()
    {
        Id = Guid.CreateVersion7(),
        AbbreviatedInvoiceThreshold = DefaultAbbreviatedInvoiceThreshold,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    /// <summary>A null <paramref name="passwordProtected"/> keeps the stored password.</summary>
    public void Update(
        bool enabled, string? baseUrl, string? username, string? passwordProtected, string? sellerPan, decimal abbreviatedInvoiceThreshold)
    {
        if (abbreviatedInvoiceThreshold < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(abbreviatedInvoiceThreshold), "The threshold cannot be negative.");
        }

        Enabled = enabled;
        BaseUrl = Normalize(baseUrl)?.TrimEnd('/');
        Username = Normalize(username);
        SellerPan = Normalize(sellerPan);
        AbbreviatedInvoiceThreshold = abbreviatedInvoiceThreshold;
        if (passwordProtected is not null)
        {
            PasswordProtected = passwordProtected;
        }

        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Everything CBMS needs to accept a bill is present.</summary>
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Username)
        && PasswordProtected is not null
        && !string.IsNullOrWhiteSpace(SellerPan);

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
