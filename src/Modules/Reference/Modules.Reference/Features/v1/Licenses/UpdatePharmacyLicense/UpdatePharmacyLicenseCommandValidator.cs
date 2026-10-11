using FluentValidation;
using FSH.Modules.Reference.Contracts.Licenses;
using FSH.Modules.Reference.Contracts.v1.Licenses;

namespace FSH.Modules.Reference.Features.v1.Licenses.UpdatePharmacyLicense;

public sealed class UpdatePharmacyLicenseCommandValidator : AbstractValidator<UpdatePharmacyLicenseCommand>
{
    public UpdatePharmacyLicenseCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.LicenseType)
            .Must(PharmacyLicenseTypes.IsKnown)
            .WithMessage("Choose the kind of license.");
        RuleFor(x => x.Title)
            .NotEmpty().When(x => x.LicenseType == PharmacyLicenseTypes.Other)
            .WithMessage("Name the license.")
            .MaximumLength(120);
        RuleFor(x => x.Number).NotEmpty().WithMessage("Enter the license or registration number.").MaximumLength(80);
        RuleFor(x => x.HolderName).MaximumLength(160);
        RuleFor(x => x.Notes).MaximumLength(1000);
        RuleFor(x => x.ExpiresOn)
            .Must((cmd, expires) => cmd.IssuedOn is null || cmd.IssuedOn <= expires)
            .WithMessage("The expiry date can't be before the issue date.");
    }
}
