using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Domain;

namespace FSH.Modules.Sales.Features.v1.Returns;

/// <summary>Shared entity -&gt; DTO mapping for the Returns slice — GetReturnById and SearchReturns
/// both need it. Display fields (medicine labels, customer name, sale invoice number) come from batch
/// lookups; missing entries leave them null.</summary>
internal static class ReturnMapper
{
    public static SaleReturnDto ToDto(
        SaleReturn r,
        IReadOnlyDictionary<Guid, MedicineSummaryDto>? medicines = null,
        IReadOnlyDictionary<Guid, CustomerLookupDto>? customers = null,
        IReadOnlyDictionary<Guid, string?>? invoiceNumbersBySale = null) =>
        new(
            r.Id, r.SaleId, r.CustomerId, r.ReturnDateUtc, r.Status.ToString(), r.ReturnReason, r.Notes,
            r.TotalReturnAmount, r.CreatedAtUtc, r.StockRestoredAtUtc,
            r.Items.Select(i =>
            {
                var medicine = medicines?.GetValueOrDefault(i.MedicineId);
                return new SaleReturnItemDto(
                    i.Id, i.SaleItemId, i.MedicineId, medicine?.Name, i.QuantityReturned, i.UnitPrice, i.TotalAmount,
                    i.Reason, i.PackagingCondition.ToString(), medicine?.Strength, medicine?.Form);
            }).ToList(),
            r.CustomerId is { } customerId ? customers?.GetValueOrDefault(customerId)?.Name : null,
            invoiceNumbersBySale?.GetValueOrDefault(r.SaleId),
            r.BranchId,
            r.RefundMethod,
            r.SettlementCashAmount,
            r.SettlementBankAmount,
            r.SettlementOnAccountAmount,
            r.CreditNoteNumber,
            r.FiscalYear is { } fy ? NepalFiscalYear.Label(fy) : null);
}
