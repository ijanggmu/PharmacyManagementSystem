using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.StartStockCountSession;

public sealed class StartStockCountSessionCommandValidator : AbstractValidator<StartStockCountSessionCommand>
{
    public StartStockCountSessionCommandValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();
    }
}
