using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FluentValidation;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.CancelStockTransfer;

public sealed class CancelStockTransferCommandValidator : AbstractValidator<CancelStockTransferCommand>
{
    public CancelStockTransferCommandValidator()
    {
        RuleFor(x => x.StockTransferId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(500);
    }
}
