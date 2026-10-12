using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;

namespace FSH.Modules.Sales.Features.v1.Refunds;

internal static class RefundMapper
{
    public static SaleRefundDto ToDto(
        SaleRefund r,
        string? originalInvoiceNumber = null,
        IReadOnlyDictionary<Guid, bool>? isTaxableBySaleItem = null,
        int printCount = 0,
        IReadOnlyDictionary<Guid, MedicineSummaryDto>? medicines = null,
        IReadOnlyDictionary<Guid, CustomerLookupDto>? customers = null) =>
        new(
            r.Id, r.OriginalSaleId, r.CustomerId, r.RefundDateUtc, r.Status.ToString(), r.RefundReason,
            r.RefundType, r.RefundMethod, r.RefundAmount, r.TaxRefundAmount, r.ProcessingFee, r.NetRefundAmount,
            r.RefundNumber, r.CreditNoteNumber, r.Notes, r.CreatedAtUtc,
            r.Items.Select(i =>
            {
                var medicine = medicines?.GetValueOrDefault(i.MedicineId);
                return new SaleRefundItemDto(
                    i.Id, i.SaleItemId, i.MedicineId, medicine?.Name, i.QuantityRefunded, i.UnitPrice, i.TotalRefundAmount,
                    isTaxableBySaleItem?.GetValueOrDefault(i.SaleItemId, true) ?? true,
                    medicine?.Strength, medicine?.Form);
            }).ToList(),
            r.BranchId,
            originalInvoiceNumber,
            r.FiscalYear is { } fy ? NepalFiscalYear.Label(fy) : null,
            r.VatRatePercent, r.TaxableAmount, r.VatAmount, r.ExemptAmount,
            printCount,
            r.CustomerId is { } customerId ? customers?.GetValueOrDefault(customerId)?.Name : null,
            r.SettlementCashAmount,
            r.SettlementBankAmount,
            r.SettlementOnAccountAmount);
}
