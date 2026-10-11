using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.VoidVoucher;

public sealed class VoidVoucherCommandValidator : AbstractValidator<VoidVoucherCommand>
{
    public VoidVoucherCommandValidator()
    {
        RuleFor(x => x.VoucherId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(512);
    }
}
