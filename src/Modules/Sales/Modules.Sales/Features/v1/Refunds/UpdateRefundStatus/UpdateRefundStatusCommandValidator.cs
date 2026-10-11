using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Refunds;

namespace FSH.Modules.Sales.Features.v1.Refunds.UpdateRefundStatus;

public sealed class UpdateRefundStatusCommandValidator : AbstractValidator<UpdateRefundStatusCommand>
{
    public UpdateRefundStatusCommandValidator()
    {
        RuleFor(x => x.RefundId).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(1024);
    }
}
