using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineById;

public sealed class GetMedicineByIdQueryHandler(
    InventoryDbContext dbContext,
    TimeProvider timeProvider,
    ICurrentBranch currentBranch)
    : IQueryHandler<GetMedicineByIdQuery, MedicineDto>
{
    public async ValueTask<MedicineDto> Handle(GetMedicineByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var m = await dbContext.Medicines
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == query.MedicineId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {query.MedicineId} not found.");

        var batches = await dbContext.MedicineBatches
            .AsNoTracking()
            .Where(b => b.MedicineId == m.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal totalOnHand = batches.Where(b => !b.IsDisposed).Sum(b => b.QuantityOnHand);

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        decimal? branchOnHand = branchId is { } bid
            ? batches.Where(b => b.BranchId == bid && !b.IsDisposed).Sum(b => b.QuantityOnHand)
            : null;

        // Any lot row means stock was received; otherwise a ledger row is the only other trace of stock.
        bool hasStockHistory = batches.Count > 0
            || await MedicineStockHistory.HasAnyAsync(dbContext, m.Id, cancellationToken).ConfigureAwait(false);

        var today = NepalClock.Today(timeProvider);
        var agg = MedicineBatchAggregator.Aggregate(batches, today).GetOrEmpty(m.Id);

        return new MedicineDto(
            m.Id, m.Name, m.GenericName, m.CategoryId, m.ReorderLevel, m.IsControlled, totalOnHand,
            m.IsDeleted, m.CreatedAtUtc, m.UpdatedAtUtc, m.DeletedOnUtc, m.DeletedBy,
            agg.NearestExpiry, agg.Count, agg.RackLocations, agg.FefoPicks,
            m.UnitPrice, m.CostPrice, m.Form, m.Strength, m.SupplierId, m.Barcode, m.Description,
            m.MaximumStock, m.PrescriptionRequired,
            m.BrandName, m.Dosage, m.SideEffects, m.StorageInstructions,
            m.StorageTempMinC, m.StorageTempMaxC, m.RequiresColdChain,
            m.UnitsPerPack, m.UnitLabel, m.IsTaxable,
            m.SupplierInvoiceNumber, m.VatAmount,
            branchOnHand,
            m.ControlledSchedule,
            HasStockHistory: hasStockHistory,
            PacksPerBox: m.PacksPerBox,
            BoxLabel: m.BoxLabel);
    }
}
