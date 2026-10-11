using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Ledger;

namespace FSH.Modules.Customers.Features.v1.Ledger.RecordCustomerPayment;

public sealed class RecordCustomerPaymentCommandValidator : AbstractValidator<RecordCustomerPaymentCommand>
{
    public RecordCustomerPaymentCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.Amount).GreaterThan(0m);
        RuleFor(x => x.Description).MaximumLength(512);
        RuleFor(x => x.PaymentMethod).MaximumLength(32);

        // The payment date drives the receipt's fiscal year and the ledger/aging position, so a missing
        // (default) or implausible date is rejected rather than silently filed in the wrong period.
        RuleFor(x => x.PaymentDateUtc)
            .Cascade(CascadeMode.Stop)
            .NotEqual(default(DateTime)).WithMessage("Enter the payment date.")
            .Must(d => d <= DateTime.UtcNow.AddDays(1)).WithMessage("The payment date can't be in the future.")
            .Must(d => d >= DateTime.UtcNow.AddYears(-1)).WithMessage("The payment date can't be more than a year ago.");
    }
}
