using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.StockTransfers;

public sealed record ReceiveStockTransferCommand(Guid StockTransferId) : ICommand<Guid>;
