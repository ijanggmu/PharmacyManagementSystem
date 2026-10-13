using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Tds;

namespace FSH.Modules.Accounting.Features.v1.Tds.RecordTdsPayment;

public sealed class RecordTdsPaymentCommandValidator : AbstractValidator<RecordTdsPaymentCommand>
{
    public RecordTdsPaymentCommandValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0m).PrecisionScale(18, 2, ignoreTrailingZeros: true);
        RuleFor(x => x.PaymentMethod).NotEmpty().MaximumLength(32);
        RuleFor(x => x.Reference).MaximumLength(128);
        RuleFor(x => x.Narration).MaximumLength(1024);
        RuleFor(x => x.PaymentDateUtc).NotEmpty();
    }
}
