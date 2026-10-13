using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Ledger;

namespace FSH.Modules.Customers.Features.v1.Ledger.VoidCustomerPayment;

public sealed class VoidCustomerPaymentCommandValidator : AbstractValidator<VoidCustomerPaymentCommand>
{
    public VoidCustomerPaymentCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.PaymentId).NotEmpty();
        RuleFor(x => x.Reason)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Give a reason for voiding the payment.")
            .Must(r => r.Trim().Length >= 3).WithMessage("Give a short reason (at least 3 characters).")
            .MaximumLength(500);
    }
}
