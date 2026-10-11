using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FluentValidation;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.ReceiveStockTransfer;

public sealed class ReceiveStockTransferCommandValidator : AbstractValidator<ReceiveStockTransferCommand>
{
    public ReceiveStockTransferCommandValidator()
    {
        RuleFor(x => x.StockTransferId).NotEmpty();
    }
}
