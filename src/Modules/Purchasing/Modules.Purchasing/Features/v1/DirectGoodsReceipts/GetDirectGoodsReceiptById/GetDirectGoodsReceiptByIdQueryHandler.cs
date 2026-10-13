using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Services;
using FSH.Modules.Sales.Contracts.Fiscal;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.GetDirectGoodsReceiptById;

public sealed class GetDirectGoodsReceiptByIdQueryHandler(PurchasingDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetDirectGoodsReceiptByIdQuery, DirectGoodsReceiptDto>
{
    public async ValueTask<DirectGoodsReceiptDto> Handle(GetDirectGoodsReceiptByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var receipt = await dbContext.DirectGoodsReceipts
            .AsNoTracking()
            .Include(r => r.Lines)
            .FirstOrDefaultAsync(r => r.Id == query.ReceiptId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Direct goods receipt {query.ReceiptId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(receipt.BranchId, $"Direct goods receipt {query.ReceiptId} not found.", cancellationToken).ConfigureAwait(false);

        var names = await LoadNamesAsync(mediator, [receipt], cancellationToken).ConfigureAwait(false);
        return Map(receipt, names);
    }

    internal static ValueTask<PurchasingNames> LoadNamesAsync(
        IMediator mediator, IReadOnlyCollection<Domain.DirectGoodsReceipt> receipts, CancellationToken cancellationToken) =>
        PurchasingNames.LoadAsync(
            mediator,
            receipts.Select(r => r.SupplierId),
            receipts.SelectMany(r => r.Lines).Select(l => l.MedicineId),
            cancellationToken);

    internal static DirectGoodsReceiptDto Map(Domain.DirectGoodsReceipt receipt, PurchasingNames names)
    {
        ArgumentNullException.ThrowIfNull(receipt);
        ArgumentNullException.ThrowIfNull(names);

        var lines = receipt.Lines
            .Select(l => new DirectGoodsReceiptLineDto(
                l.Id, l.MedicineId, names.Medicine(l.MedicineId), l.Quantity, l.UnitCostPrice, l.VatAmount, l.NetAmount, l.BatchId, l.BatchNo,
                l.FreeQuantity, l.DiscountPercent, l.DiscountAmount, l.BillDiscountAmount, l.GrossAmount, l.EffectiveUnitCost,
                l.PackSize, l.PackUnitCost))
            .ToList();

        return new DirectGoodsReceiptDto(
            receipt.Id, receipt.SupplierId, names.Supplier(receipt.SupplierId), receipt.ReceiptDateUtc, receipt.SupplierInvoiceNumber,
            receipt.Status.ToString(), receipt.NetAmount, receipt.VatAmount, receipt.GrossAmount,
            receipt.CreatedAtUtc, receipt.CreatedBy, receipt.VoidedAtUtc, receipt.VoidedBy, receipt.VoidReason, lines,
            receipt.BranchId,
            receipt.ReceiptNumber,
            receipt.FiscalYear is { } fiscalYear ? NepalFiscalYear.Label(fiscalYear) : null,
            receipt.SubtotalAmount, receipt.LineDiscountAmount, receipt.BillDiscountPercent, receipt.BillDiscountAmount);
    }
}
