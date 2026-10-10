using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.StockTransfers;

public sealed record CancelStockTransferCommand(Guid StockTransferId, string Reason) : ICommand<Guid>;
