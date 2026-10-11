using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;

public sealed record VoidDirectGoodsReceiptCommand(Guid ReceiptId, string Reason) : ICommand<Guid>;
