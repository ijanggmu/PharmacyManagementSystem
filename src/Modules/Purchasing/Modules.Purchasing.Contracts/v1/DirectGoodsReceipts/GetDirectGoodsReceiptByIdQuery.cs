using FSH.Modules.Purchasing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;

public sealed record GetDirectGoodsReceiptByIdQuery(Guid ReceiptId) : IQuery<DirectGoodsReceiptDto>;
