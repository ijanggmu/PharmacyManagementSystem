namespace FSH.Modules.Reference.Contracts.Dtos;

public sealed record PharmacySettingsDto(
    Guid Id,
    string BusinessName,
    string? BusinessAddress,
    string? BusinessPhone,
    string? BusinessEmail,
    string CurrencyCode,
    decimal VatRatePercent,
    string InvoiceNumberPrefix,
    int NextInvoiceSequence,
    DateTime? UpdatedAtUtc);
