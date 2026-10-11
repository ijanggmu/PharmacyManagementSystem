using FluentValidation;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ApprovePurchaseOrder;

public sealed class ApprovePurchaseOrderCommandValidator : AbstractValidator<ApprovePurchaseOrderCommand>
{
    public ApprovePurchaseOrderCommandValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
    }
}
