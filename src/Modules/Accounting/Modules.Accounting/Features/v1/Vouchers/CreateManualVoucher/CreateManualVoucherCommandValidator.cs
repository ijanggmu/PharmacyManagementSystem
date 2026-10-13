using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Services;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.CreateManualVoucher;

public sealed class CreateManualVoucherCommandValidator : AbstractValidator<CreateManualVoucherCommand>
{
    public CreateManualVoucherCommandValidator()
    {
        RuleFor(x => x.VoucherDateUtc)
            .NotEqual(default(DateTime)).WithMessage("Choose the voucher date.")
            .Must(date => NepalDate.FromUtc(date) <= NepalDate.FromUtc(DateTime.UtcNow))
            .WithMessage("The voucher date can't be in the future (Nepal time).");
        RuleFor(x => x.Narration).MaximumLength(1024);
        RuleFor(x => x.Lines).NotEmpty().WithMessage("A voucher must have at least one line.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.AccountId).NotEmpty();
            line.RuleFor(l => l.DebitAmount).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.CreditAmount).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l).Must(l => (l.DebitAmount > 0) != (l.CreditAmount > 0))
                .WithMessage("Each line must have exactly one of debit or credit greater than zero.");
        });
    }
}
