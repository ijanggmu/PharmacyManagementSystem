using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.Settings;

namespace FSH.Modules.Reference.Features.v1.Settings.UpdatePharmacySettings;

public sealed class UpdatePharmacySettingsCommandValidator : AbstractValidator<UpdatePharmacySettingsCommand>
{
    public UpdatePharmacySettingsCommandValidator()
    {
        RuleFor(x => x.BusinessName).NotEmpty().MaximumLength(256);
        RuleFor(x => x.BusinessAddress).MaximumLength(512);
        RuleFor(x => x.BusinessPhone).MaximumLength(32);
        RuleFor(x => x.BusinessEmail).MaximumLength(256).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.BusinessEmail));
        RuleFor(x => x.CurrencyCode).NotEmpty().Length(3);
        // The column is numeric(5,2): at most 2 decimals, so the rate a sale uses is exactly the one saved.
        RuleFor(x => x.VatRatePercent)
            .InclusiveBetween(0m, 100m)
            .PrecisionScale(5, 2, ignoreTrailingZeros: true)
            .WithMessage("VAT rate can have at most 2 decimal places.");
        RuleFor(x => x.InvoiceNumberPrefix).NotEmpty().MaximumLength(16);
    }
}
