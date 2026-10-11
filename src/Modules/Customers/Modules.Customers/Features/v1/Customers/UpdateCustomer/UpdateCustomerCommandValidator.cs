using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Customers;

namespace FSH.Modules.Customers.Features.v1.Customers.UpdateCustomer;

public sealed class UpdateCustomerCommandValidator : AbstractValidator<UpdateCustomerCommand>
{
    public UpdateCustomerCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.CreditLimit).GreaterThanOrEqualTo(0m).When(x => x.CreditLimit is not null)
            .WithMessage("Credit limit can't be negative.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Phone).MaximumLength(32);
        RuleFor(x => x.Email).MaximumLength(256).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.Address).MaximumLength(512);
        RuleFor(x => x.Allergies).Must(a => a is null || a.Count <= 50).WithMessage("At most 50 allergies.");
        RuleForEach(x => x.Allergies).ChildRules(a => a.RuleFor(v => v).NotEmpty().MaximumLength(100));
        RuleFor(x => x.ChronicConditions).Must(a => a is null || a.Count <= 50).WithMessage("At most 50 chronic conditions.");
        RuleForEach(x => x.ChronicConditions).ChildRules(a => a.RuleFor(v => v).NotEmpty().MaximumLength(100));
        RuleFor(x => x.CurrentMedications).Must(a => a is null || a.Count <= 50).WithMessage("At most 50 current medications.");
        RuleForEach(x => x.CurrentMedications).ChildRules(a => a.RuleFor(v => v).NotEmpty().MaximumLength(100));
    }
}
