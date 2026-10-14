using FluentValidation;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;

public sealed class CreatePurchaseOrderCommandValidator : AbstractValidator<CreatePurchaseOrderCommand>
{
    public CreatePurchaseOrderCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        // An order is raised today or earlier — never dated in the future.
        RuleFor(x => x.OrderDateUtc).NotEmpty().Must(BusinessDateRules.IsValid).WithMessage(BusinessDateRules.Message);
        RuleFor(x => x.Narration).MaximumLength(1024);
        RuleFor(x => x.SupplierInvoiceNumber)
            .Must(v => v is null || v.Trim().Length <= 64)
            .WithMessage("Supplier invoice number must be 64 characters or fewer.");
        RuleFor(x => x.Lines).NotEmpty().WithMessage("A purchase order must have at least one line.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.MedicineId).NotEmpty();
            line.RuleFor(l => l.BatchNo).MaximumLength(64);
            line.RuleFor(l => l.Quantity).GreaterThan(0m);
            line.RuleFor(l => l.UnitCostPrice).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.SellingPrice).GreaterThanOrEqualTo(0m).When(l => l.SellingPrice is not null);
            line.RuleFor(l => l.RackLocation).MaximumLength(64);
            line.RuleFor(l => l.VatAmount).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.FreeQuantity).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.DiscountPercent).InclusiveBetween(0m, 100m);
            line.RuleFor(l => l.DiscountAmount).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l)
                .Must(l => PurchaseLineMath.LineDiscount(l.Quantity * l.UnitCostPrice, l.DiscountPercent, l.DiscountAmount)
                    <= PurchaseLineMath.Round(l.Quantity * l.UnitCostPrice))
                .WithName("DiscountAmount")
                .WithMessage("Line discount cannot be more than the line amount.");
        });
        RuleFor(x => x.BillDiscountPercent).InclusiveBetween(0m, 100m);
        RuleFor(x => x.BillDiscountAmount).GreaterThanOrEqualTo(0m);
    }
}
