using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Domain;

namespace FSH.Modules.Suppliers.Features.v1.Returns;

internal static class SupplierReturnMapper
{
    public static SupplierReturnDto ToDto(this SupplierReturn entity) =>
        new(
            entity.Id,
            entity.SupplierId,
            entity.ReturnDateUtc,
            entity.Notes,
            entity.TotalCost,
            entity.CreatedAtUtc,
            entity.Items
                .Select(i => new SupplierReturnItemDto(i.Id, i.MedicineId, i.Quantity, i.UnitCost, i.TotalCost, i.ReturnReason, i.Notes))
                .ToList(),
            entity.BranchId);
}
