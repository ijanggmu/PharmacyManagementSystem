using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.ListTrashedMedicines;

public sealed class ListTrashedMedicinesQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<ListTrashedMedicinesQuery, PagedResponse<MedicineDto>>
{
    public async ValueTask<PagedResponse<MedicineDto>> Handle(
        ListTrashedMedicinesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 20 : query.PageSize;

        var q = dbContext.Medicines
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(m => m.IsDeleted)
            .OrderByDescending(m => m.DeletedOnUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q
            .Skip((page - 1) * size)
            .Take(size)
            .Select(m => new MedicineDto(
                m.Id, m.Name, m.GenericName, m.CategoryId, m.ReorderLevel, m.IsControlled, 0m,
                m.IsDeleted, m.CreatedAtUtc, m.UpdatedAtUtc, m.DeletedOnUtc, m.DeletedBy,
                null, 0, null, null, m.UnitPrice, m.CostPrice, m.Form, m.Strength,
                m.SupplierId, m.Barcode, m.Description, m.MaximumStock, m.PrescriptionRequired,
                m.BrandName, m.Dosage, m.SideEffects, m.StorageInstructions,
                m.StorageTempMinC, m.StorageTempMaxC, m.RequiresColdChain,
                m.UnitsPerPack, m.UnitLabel, m.IsTaxable,
                m.SupplierInvoiceNumber, m.VatAmount, null, m.ControlledSchedule,
                null, null, false, m.PacksPerBox, m.BoxLabel))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<MedicineDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
