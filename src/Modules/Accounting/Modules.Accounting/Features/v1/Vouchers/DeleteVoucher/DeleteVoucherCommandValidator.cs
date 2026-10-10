using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.DeleteVoucher;

public sealed class DeleteVoucherCommandValidator : AbstractValidator<DeleteVoucherCommand>
{
    public DeleteVoucherCommandValidator()
    {
        RuleFor(x => x.VoucherId).NotEmpty();
    }
}
