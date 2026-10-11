using FSH.Modules.Purchasing.Contracts.v1.Documents;
using FSH.Modules.Purchasing.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.Documents.GetPurchaseDocumentNumbers;

public sealed class GetPurchaseDocumentNumbersQueryHandler(PurchasingDbContext dbContext)
    : IQueryHandler<GetPurchaseDocumentNumbersQuery, IReadOnlyList<PurchaseDocumentNumberDto>>
{
    public async ValueTask<IReadOnlyList<PurchaseDocumentNumberDto>> Handle(
        GetPurchaseDocumentNumbersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var results = new List<PurchaseDocumentNumberDto>();

        if (query.DirectGoodsReceiptIds.Count > 0)
        {
            var receiptIds = query.DirectGoodsReceiptIds.ToList();
            results.AddRange(await dbContext.DirectGoodsReceipts
                .AsNoTracking()
                .Where(r => receiptIds.Contains(r.Id))
                .Select(r => new PurchaseDocumentNumberDto(r.Id, r.ReceiptNumber, r.SupplierInvoiceNumber))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false));
        }

        if (query.PurchaseOrderIds.Count > 0)
        {
            var orderIds = query.PurchaseOrderIds.ToList();
            results.AddRange(await dbContext.PurchaseOrders
                .AsNoTracking()
                .Where(o => orderIds.Contains(o.Id))
                .Select(o => new PurchaseDocumentNumberDto(o.Id, null, o.SupplierInvoiceNumber))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false));
        }

        return results;
    }
}
