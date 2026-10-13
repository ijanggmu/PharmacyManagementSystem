using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Services;

namespace FSH.Modules.Inventory.Features.v1.Batches.CreateBatch;

public sealed class CreateBatchCommandValidator : AbstractValidator<CreateBatchCommand>
{
    public CreateBatchCommandValidator()
    {
        RuleFor(x => x.MedicineId).NotEmpty();
        RuleFor(x => x.BatchNo).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Quantity).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.SellingPrice).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.RackLocation).MaximumLength(64);
        RuleFor(x => x.StockFunding).MustBeKnownStockFunding();
    }
}
