using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Settings;

public sealed record UpdatePharmacySettingsCommand(
    string BusinessName,
    string? BusinessAddress,
    string? BusinessPhone,
    string? BusinessEmail,
    string CurrencyCode,
    decimal VatRatePercent,
    string InvoiceNumberPrefix) : ICommand<Guid>;
