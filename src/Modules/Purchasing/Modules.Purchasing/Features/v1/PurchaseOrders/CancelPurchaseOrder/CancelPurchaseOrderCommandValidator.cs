using FluentValidation;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CancelPurchaseOrder;

public sealed class CancelPurchaseOrderCommandValidator : AbstractValidator<CancelPurchaseOrderCommand>
{
    public CancelPurchaseOrderCommandValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(512);
    }
}
