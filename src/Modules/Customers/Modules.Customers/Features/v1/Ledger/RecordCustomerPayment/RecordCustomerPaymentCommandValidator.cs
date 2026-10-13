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
