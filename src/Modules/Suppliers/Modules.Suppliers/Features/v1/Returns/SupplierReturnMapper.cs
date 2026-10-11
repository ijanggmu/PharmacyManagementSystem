using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Domain;

namespace FSH.Modules.Suppliers.Features.v1.Returns;

internal static class SupplierReturnMapper
{
    public static SupplierReturnDto ToDto(this SupplierReturn entity, string? supplierName = null) =>
        new(
            entity.Id,
            entity.SupplierId,
            entity.ReturnDateUtc,
            entity.Notes,
            entity.TotalCost,
            entity.CreatedAtUtc,
            entity.Items
                .Select(i => new SupplierReturnItemDto(
                    i.Id, i.MedicineId, i.Quantity, i.UnitCost, i.TotalCost, i.ReturnReason, i.Notes,
                    i.MedicineName, i.BatchId, i.BatchNo, i.VatAmount))
                .ToList(),
            entity.BranchId,
            entity.DocumentNumber,
            entity.SupplierInvoiceNumber,
            entity.VatAmount,
            entity.TotalAmount,
            supplierName);
}
