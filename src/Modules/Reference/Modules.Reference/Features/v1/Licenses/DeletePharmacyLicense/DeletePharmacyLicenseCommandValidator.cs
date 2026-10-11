using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.Licenses;

namespace FSH.Modules.Reference.Features.v1.Licenses.DeletePharmacyLicense;

public sealed class DeletePharmacyLicenseCommandValidator : AbstractValidator<DeletePharmacyLicenseCommand>
{
    public DeletePharmacyLicenseCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}
