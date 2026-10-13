using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Services;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;

public sealed class RecordSupplierPaymentCommandValidator : AbstractValidator<RecordSupplierPaymentCommand>
{
    public RecordSupplierPaymentCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.Amount).GreaterThan(0m);
        RuleFor(x => x.PaymentDateUtc).NotEmpty().Must(BusinessDateRules.IsValid).WithMessage(BusinessDateRules.Message);
        RuleFor(x => x.Description).MaximumLength(512);
        RuleFor(x => x.PaymentMethod).MaximumLength(32);
        RuleFor(x => x.BillReferenceType).MaximumLength(64);
        RuleFor(x => x.BillReferenceId)
            .NotEmpty()
            .When(x => !string.IsNullOrWhiteSpace(x.BillReferenceType))
            .WithMessage("Choose the bill to pay, or clear the bill type to settle the oldest bills first.");

        // TDS: the money paid out is Amount − TDS, so the TDS must leave something to pay.
        RuleFor(x => x.TdsAmount!.Value)
            .GreaterThanOrEqualTo(0m)
            .LessThan(x => x.Amount).WithMessage("TDS must be less than the payment amount.")
            .PrecisionScale(18, 2, ignoreTrailingZeros: true)
            .When(x => x.TdsAmount is not null);
        RuleFor(x => x.TdsCategory).MaximumLength(32);
        RuleFor(x => x.TdsCategory)
            .NotEmpty().WithMessage("Choose the TDS category the tax was withheld under.")
            .When(x => x.TdsAmount > 0);
        RuleFor(x => x.TdsRatePercent!.Value)
            .GreaterThan(0m).LessThanOrEqualTo(100m)
            .When(x => x.TdsRatePercent is not null);
        RuleFor(x => x.TdsTaxableAmount!.Value)
            .GreaterThan(0m)
            .LessThanOrEqualTo(x => x.Amount).WithMessage("The TDS taxable amount can't be more than the payment amount.")
            .When(x => x.TdsTaxableAmount is not null);
        RuleFor(x => x.TdsAmount!.Value)
            .LessThanOrEqualTo(x => x.TdsTaxableAmount!.Value).WithMessage("TDS can't be more than the taxable amount.")
            .When(x => x.TdsAmount is not null && x.TdsTaxableAmount is not null);

        // Cheque details: only on a cheque, and a cheque number makes the date required. Cheques in Nepal go stale
        // six months after their date, so an older cheque can't be taken; a post-dated one may be up to a year ahead.
        RuleFor(x => x.ChequeNumber).MaximumLength(32);
        RuleFor(x => x.ChequeBank).MaximumLength(128);
        RuleFor(x => x.ChequeNumber)
            .Must((x, _) => string.Equals(x.PaymentMethod?.Trim(), "cheque", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Cheque details can only be given for a payment by cheque.")
            .When(x => !string.IsNullOrWhiteSpace(x.ChequeNumber));
        RuleFor(x => x.ChequeNumber)
            .NotEmpty().WithMessage("Enter the cheque number.")
            .When(x => x.ChequeDateUtc is not null || !string.IsNullOrWhiteSpace(x.ChequeBank) || x.ChequeClearedOnDeposit);
        RuleFor(x => x.ChequeDateUtc)
            .NotNull().WithMessage("Enter the date written on the cheque.")
            .When(x => !string.IsNullOrWhiteSpace(x.ChequeNumber));
        RuleFor(x => x.ChequeDateUtc!.Value)
            .Must((x, d) => d >= x.PaymentDateUtc.AddDays(-183)).WithMessage("The cheque is more than six months old (stale).")
            .Must((x, d) => d <= x.PaymentDateUtc.AddDays(366)).WithMessage("The cheque date can't be more than a year after the payment.")
            .When(x => x.ChequeDateUtc is not null);
    }
}
