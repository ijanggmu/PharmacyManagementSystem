using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Domain;

namespace FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;

public sealed class CreateRefundCommandValidator : AbstractValidator<CreateRefundCommand>
{
    public CreateRefundCommandValidator()
    {
        RuleFor(x => x.OriginalSaleId).NotEmpty();
        RuleFor(x => x.RefundReason).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        // Prices are VAT-inclusive: the VAT is carved out of the refunded lines server-side, never added on top.
        RuleFor(x => x.TaxRefundAmount).Equal(0m)
            .WithMessage("VAT is already included in the item prices — do not send a separate tax refund amount.");
        RuleFor(x => x.RefundMethod)
            .MaximumLength(32)
            .Must(RefundMethods.IsKnown)
            .WithMessage("Refund method must be one of: " + string.Join(", ", RefundMethods.All) + ".");
        // Not above the refund itself either — checked by the handler once the lines are valued (SaleRefund.EnsureProcessingFeeWithinRefund).
        RuleFor(x => x.ProcessingFee).GreaterThanOrEqualTo(0m).PrecisionScale(18, 2, ignoreTrailingZeros: true);
        RuleFor(x => x.Notes).MaximumLength(1024);
        RuleFor(x => x.ApprovalTokens).Must(t => t is null || t.Count <= 5).WithMessage("At most 5 approval tokens.");
        RuleForEach(x => x.ApprovalTokens).NotEmpty().MaximumLength(128);
        RuleFor(x => x.RefundItems).NotEmpty().WithMessage("At least one refund item is required.");
        RuleForEach(x => x.RefundItems).ChildRules(item =>
        {
            item.RuleFor(i => i.SaleItemId).NotEmpty();
            item.RuleFor(i => i.QuantityRefunded).GreaterThan(0m);
        });
    }
}
