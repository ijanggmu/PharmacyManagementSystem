using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Domain;

namespace FSH.Modules.Customers.Features.v1.Customers.UpdateCustomer;

public sealed class UpdateCustomerCommandValidator : AbstractValidator<UpdateCustomerCommand>
{
    public UpdateCustomerCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.CreditDays).InclusiveBetween(0, PaymentTerms.MaxCreditDays).When(x => x.CreditDays is not null)
            .WithMessage($"Credit days must be between 0 and {PaymentTerms.MaxCreditDays}.");
        RuleFor(x => x.CreditLimit).GreaterThanOrEqualTo(0m).When(x => x.CreditLimit is not null)
            .WithMessage("Credit limit can't be negative.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Phone).MaximumLength(32);
        RuleFor(x => x.Email).MaximumLength(256).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.Address).MaximumLength(512);
        RuleFor(x => x.PanNumber)
            .Must(CustomerProfileRules.IsValidPan).WithMessage(CustomerProfileRules.PanMessage)
            .When(x => !string.IsNullOrWhiteSpace(x.PanNumber));
        RuleFor(x => x.DateOfBirth!.Value)
            .Must(CustomerProfileRules.IsPlausibleDateOfBirth).WithMessage(CustomerProfileRules.DateOfBirthMessage)
            .OverridePropertyName(nameof(UpdateCustomerCommand.DateOfBirth))
            .When(x => x.DateOfBirth is not null);
        RuleFor(x => x.InsuranceProvider).MaximumLength(128);
        RuleFor(x => x.InsuranceNumber).MaximumLength(64);
        RuleFor(x => x.Allergies).Must(a => a is null || a.Count <= 50).WithMessage("At most 50 allergies.");
        RuleForEach(x => x.Allergies).ChildRules(a => a.RuleFor(v => v).NotEmpty().MaximumLength(100));
        RuleFor(x => x.ChronicConditions).Must(a => a is null || a.Count <= 50).WithMessage("At most 50 chronic conditions.");
        RuleForEach(x => x.ChronicConditions).ChildRules(a => a.RuleFor(v => v).NotEmpty().MaximumLength(100));
        RuleFor(x => x.CurrentMedications).Must(a => a is null || a.Count <= 50).WithMessage("At most 50 current medications.");
        RuleForEach(x => x.CurrentMedications).ChildRules(a => a.RuleFor(v => v).NotEmpty().MaximumLength(100));
    }
}
