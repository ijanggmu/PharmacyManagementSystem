using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.PostStockCountSession;

public sealed class PostStockCountSessionCommandValidator : AbstractValidator<PostStockCountSessionCommand>
{
    public PostStockCountSessionCommandValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();
    }
}
