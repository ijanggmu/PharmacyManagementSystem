using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.CreateStockCountSession;

public sealed class CreateStockCountSessionCommandValidator : AbstractValidator<CreateStockCountSessionCommand>
{
    public CreateStockCountSessionCommandValidator()
    {
        RuleFor(x => x.Title).MaximumLength(128);
        RuleFor(x => x.RackLocation).MaximumLength(64);
        RuleFor(x => x.Notes).MaximumLength(1024);
        RuleFor(x => x.CategoryId).NotEqual(Guid.Empty).When(x => x.CategoryId is not null);
        RuleFor(x => x.SupplierId).NotEqual(Guid.Empty).When(x => x.SupplierId is not null);
    }
}
