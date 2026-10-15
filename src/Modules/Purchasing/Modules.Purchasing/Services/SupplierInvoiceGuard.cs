using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Services;

/// <summary>
/// One supplier bill is booked once: a supplier invoice number already on a direct goods receipt that isn't voided,
/// or on a received purchase order, from the same supplier is refused (409) — booking it again would post the payable
/// and the input VAT twice. Compared trimmed and case-insensitively; a blank number is not checked.
/// </summary>
internal static class SupplierInvoiceGuard
{
    public static async Task EnsureUnusedAsync(
        PurchasingDbContext dbContext, Guid supplierId, string? supplierInvoiceNumber, Guid? excludePurchaseOrderId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (string.IsNullOrWhiteSpace(supplierInvoiceNumber))
        {
            return;
        }

        string invoice = supplierInvoiceNumber.Trim().ToUpperInvariant();

#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
        string? receiptNumber = await dbContext.DirectGoodsReceipts.AsNoTracking()
            .Where(r => r.SupplierId == supplierId && r.Status != DirectGoodsReceiptStatus.Voided
                && r.SupplierInvoiceNumber != null && r.SupplierInvoiceNumber.Trim().ToUpper() == invoice)
            .Select(r => r.ReceiptNumber ?? r.Id.ToString())
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        string? orderNumber = receiptNumber is not null
            ? null
            : await dbContext.PurchaseOrders.AsNoTracking()
                .Where(o => o.SupplierId == supplierId && o.Status == PurchaseOrderStatus.Received
                    && (excludePurchaseOrderId == null || o.Id != excludePurchaseOrderId)
                    && o.SupplierInvoiceNumber != null && o.SupplierInvoiceNumber.Trim().ToUpper() == invoice)
                .Select(o => o.OrderNumber ?? o.Id.ToString())
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862

        string? document = null;
        if (receiptNumber is not null)
        {
            document = $"goods receipt {receiptNumber}";
        }
        else if (orderNumber is not null)
        {
            document = $"purchase order {orderNumber}";
        }

        if (document is not null)
        {
            throw new CustomException(
                $"Supplier invoice {supplierInvoiceNumber.Trim()} from this supplier is already booked on {document}. Check the invoice number, or void that document first.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
