using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.VoidSupplierPayment;

public sealed class VoidSupplierPaymentCommandValidator : AbstractValidator<VoidSupplierPaymentCommand>
{
    public VoidSupplierPaymentCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.PaymentId).NotEmpty();
        RuleFor(x => x.Reason)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Give a reason for voiding the payment.")
            .Must(r => r.Trim().Length >= 3).WithMessage("Give a short reason (at least 3 characters).")
            .MaximumLength(500);
    }
}
