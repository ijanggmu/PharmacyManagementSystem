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
    }
}
