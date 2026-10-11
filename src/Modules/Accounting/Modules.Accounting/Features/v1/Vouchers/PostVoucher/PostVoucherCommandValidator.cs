using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.PostVoucher;

public sealed class PostVoucherCommandValidator : AbstractValidator<PostVoucherCommand>
{
    public PostVoucherCommandValidator()
    {
        RuleFor(x => x.VoucherId).NotEmpty();
    }
}
