using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.UpdateSupplier;

public sealed class UpdateSupplierCommandValidator : AbstractValidator<UpdateSupplierCommand>
{
    public UpdateSupplierCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(256);
        RuleFor(x => x.ContactPerson).MaximumLength(128);
        RuleFor(x => x.Phone).MaximumLength(32);
        RuleFor(x => x.Email).MaximumLength(256).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.Address).MaximumLength(512);
        RuleFor(x => x.TaxId).MaximumLength(64)
            .Must(SupplierPanGuard.IsBlankOrValid).WithMessage(SupplierPanGuard.FormatMessage);
        RuleFor(x => x.CreditDays).InclusiveBetween(0, PaymentTerms.MaxCreditDays)
            .When(x => x.CreditDays is not null)
            .WithMessage($"Credit days must be between 0 and {PaymentTerms.MaxCreditDays}.");
    }
}
