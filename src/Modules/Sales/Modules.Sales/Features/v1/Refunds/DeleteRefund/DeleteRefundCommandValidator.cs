using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Refunds;

namespace FSH.Modules.Sales.Features.v1.Refunds.DeleteRefund;

public sealed class DeleteRefundCommandValidator : AbstractValidator<DeleteRefundCommand>
{
    public DeleteRefundCommandValidator()
    {
        RuleFor(x => x.RefundId).NotEmpty();
    }
}
