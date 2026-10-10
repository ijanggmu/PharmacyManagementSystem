using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.ReverseVoucher;

public sealed class ReverseVoucherCommandValidator : AbstractValidator<ReverseVoucherCommand>
{
    public ReverseVoucherCommandValidator()
    {
        RuleFor(x => x.VoucherId).NotEmpty();
    }
}
