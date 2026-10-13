using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Ird;

/// <summary>
/// The tenant's IRD CBMS e-billing settings. The CBMS password is write-only: it is stored encrypted and only
/// reported back as <see cref="HasPassword"/>. <see cref="EffectiveBaseUrl"/> is where documents actually go
/// (the tenant's <see cref="BaseUrl"/>, or the host default — IRD's test server unless configured otherwise).
/// </summary>
public sealed record IrdSettingsDto(
    bool Enabled,
    string? BaseUrl,
    string EffectiveBaseUrl,
    bool IsTestEndpoint,
    string? Username,
    bool HasPassword,
    string? SellerPan,
    decimal AbbreviatedInvoiceThreshold,
    int RealtimeWindowSeconds);

/// <summary>Readable by anyone who can view sales: the POS needs the abbreviated-invoice threshold. No secrets.</summary>
public sealed record GetIrdSettingsQuery : IQuery<IrdSettingsDto>;

/// <summary>
/// Full replace of the IRD settings. An empty <see cref="Password"/> keeps the stored one. Enabling requires the
/// CBMS username, a password (new or stored) and the seller's PAN.
/// </summary>
public sealed record UpdateIrdSettingsCommand(
    bool Enabled,
    string? BaseUrl,
    string? Username,
    string? Password,
    string? SellerPan,
    decimal AbbreviatedInvoiceThreshold) : ICommand<IrdSettingsDto>;

/// <summary>Puts a failed IRD submission (bill or credit note) back in the queue and dispatches it now.</summary>
public sealed record ResendIrdQueueItemCommand(Guid QueueItemId) : ICommand<IrdResendResultDto>;

/// <summary>
/// IRD's "materialized view" of sales bills (the register IRD's e-billing guidelines require a billing system to
/// keep): every bill issued in [<paramref name="FromUtc"/>, <paramref name="ToUtc"/>], or in fiscal year
/// <paramref name="FiscalYear"/> (BS start year, e.g. 2083) when given — cancelled bills included, marked inactive.
/// Branch-scoped like the other Sales reports.
/// </summary>
public sealed record GetIrdBillRegisterQuery(DateTime? FromUtc, DateTime? ToUtc, int? FiscalYear = null, Guid? BranchId = null)
    : IQuery<IReadOnlyList<IrdBillRegisterRowDto>>;
