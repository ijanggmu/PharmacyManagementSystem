using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.ChangeStockCountStatus;

public sealed class ChangeStockCountStatusCommandValidator : AbstractValidator<ChangeStockCountStatusCommand>
{
    public ChangeStockCountStatusCommandValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();
        RuleFor(x => x.Transition).IsInEnum();
    }
}
