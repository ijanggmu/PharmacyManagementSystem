using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.CreateSupplier;

public sealed class CreateSupplierCommandValidator : AbstractValidator<CreateSupplierCommand>
{
    public CreateSupplierCommandValidator()
    {
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

        // Stored as numeric(18,2): reject sub-paisa amounts and anything the column can't hold, rather than
        // silently rounding the AP ledger or failing at SaveChanges with a 500.
        RuleFor(x => x.OpeningBalance)
            .PrecisionScale(18, 2, ignoreTrailingZeros: true)
            .WithMessage("Opening balance must have at most 2 decimal places.");
    }
}
