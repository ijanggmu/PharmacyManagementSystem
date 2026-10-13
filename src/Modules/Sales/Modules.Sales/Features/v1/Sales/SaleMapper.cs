using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;

namespace FSH.Modules.Sales.Features.v1.Sales;

/// <summary>Sale -&gt; DTO mapping shared by GetSaleById and SearchSales, with medicine and customer
/// display fields filled from the batch lookups (<see cref="Shared.CrossModuleLookups"/>).</summary>
internal static class SaleMapper
{
    public static SaleDto ToDto(
        Sale s,
        IReadOnlyDictionary<Guid, MedicineSummaryDto> medicines,
        IReadOnlyDictionary<Guid, CustomerLookupDto> customers,
        int printCount = 0,
        IReadOnlyDictionary<Guid, (decimal Returned, decimal Refunded)>? reversedByLine = null)
    {
        var customer = s.CustomerId is { } customerId ? customers.GetValueOrDefault(customerId) : null;

        var items = s.Items
            .Select(i =>
            {
                var medicine = medicines.GetValueOrDefault(i.MedicineId);
                var reversed = reversedByLine?.GetValueOrDefault(i.Id) ?? default;
                return new SaleItemDto(
                    i.Id, i.MedicineId, medicine?.Name, i.Quantity, i.UnitPrice, i.DiscountAmount, i.UnitCostPrice,
                    i.LineTotal, i.DiscountPercent, i.IsTaxable,
                    medicine?.GenericName, medicine?.Strength, medicine?.Form,
                    reversed.Returned, reversed.Refunded, i.BatchId, i.BatchNo);
            })
            .ToList();

        var payments = s.Payments
            .Select(p => new SalePaymentDto(p.Id, p.Method, p.Amount, p.Reference))
            .ToList();

        return new SaleDto(
            s.Id, s.CustomerId, customer?.Name, s.SaleDateUtc, s.Status.ToString(), s.PaymentMethod, s.PaymentAmount,
            s.TotalAmount, s.BalanceDue, s.PrescriptionId, s.Notes, s.CreatedAtUtc, s.CancelledAtUtc, s.CancelReason,
            items, payments, s.CashierUserId,
            s.BranchId, s.InvoiceNumber, s.FiscalYear is { } fy ? NepalFiscalYear.Label(fy) : null,
            s.VatRatePercent, s.TaxableAmount, s.VatAmount, s.ExemptAmount, printCount,
            customer?.Phone, s.BuyerName, s.BuyerPan);
    }
}
