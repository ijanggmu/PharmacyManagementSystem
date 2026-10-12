using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Consignment;

namespace FSH.Modules.Inventory.Features.v1.Consignment.ReceiveConsignmentStock;

public sealed class ReceiveConsignmentStockCommandValidator : AbstractValidator<ReceiveConsignmentStockCommand>
{
    public ReceiveConsignmentStockCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.MedicineId).NotEmpty();
        // MedicineBatch.BatchNo is varchar(64); a longer one failed at insert with a 500.
        RuleFor(x => x.BatchNo).NotEmpty().MaximumLength(64).When(x => x.BatchNo is not null);
        RuleFor(x => x.Quantity).GreaterThan(0m);
        RuleFor(x => x.UnitCostPrice).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.SellingPrice).GreaterThanOrEqualTo(0m).When(x => x.SellingPrice is not null);
        RuleFor(x => x.RackLocation).MaximumLength(64);
    }
}
