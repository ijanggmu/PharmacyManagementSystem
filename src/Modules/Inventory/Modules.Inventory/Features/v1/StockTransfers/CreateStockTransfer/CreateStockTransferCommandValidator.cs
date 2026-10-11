using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FluentValidation;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.CreateStockTransfer;

public sealed class CreateStockTransferCommandValidator : AbstractValidator<CreateStockTransferCommand>
{
    public CreateStockTransferCommandValidator()
    {
        RuleFor(x => x.FromBranchId).NotEmpty();
        RuleFor(x => x.ToBranchId).NotEmpty();
        RuleFor(x => x)
            .Must(x => x.FromBranchId != x.ToBranchId)
            .WithMessage("Source and destination branch must differ.");
        RuleFor(x => x.Notes).MaximumLength(500);
        RuleFor(x => x.Items).NotEmpty().WithMessage("At least one item is required.");

        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.MedicineId).NotEmpty();
            item.RuleFor(i => i.Quantity).GreaterThan(0);
        });
    }
}
