using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;

public sealed class RecordSupplierPaymentCommandValidator : AbstractValidator<RecordSupplierPaymentCommand>
{
    public RecordSupplierPaymentCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.Amount).GreaterThan(0m);
        RuleFor(x => x.Description).MaximumLength(512);
        RuleFor(x => x.PaymentMethod).MaximumLength(32);
        RuleFor(x => x.BillReferenceType).MaximumLength(64);
        RuleFor(x => x.BillReferenceId)
            .NotEmpty()
            .When(x => !string.IsNullOrWhiteSpace(x.BillReferenceType))
            .WithMessage("Choose the bill to pay, or clear the bill type to settle the oldest bills first.");
    }
}
