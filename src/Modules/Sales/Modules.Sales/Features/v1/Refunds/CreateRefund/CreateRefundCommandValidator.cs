using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Refunds;

namespace FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;

public sealed class CreateRefundCommandValidator : AbstractValidator<CreateRefundCommand>
{
    public CreateRefundCommandValidator()
    {
        RuleFor(x => x.OriginalSaleId).NotEmpty();
        RuleFor(x => x.RefundReason).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.TaxRefundAmount).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.ProcessingFee).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.Notes).MaximumLength(1024);
        RuleFor(x => x.RefundItems).NotEmpty().WithMessage("At least one refund item is required.");
        RuleForEach(x => x.RefundItems).ChildRules(item =>
        {
            item.RuleFor(i => i.SaleItemId).NotEmpty();
            item.RuleFor(i => i.QuantityRefunded).GreaterThan(0m);
        });
    }
}
