using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Reports.GetNarcoticRegister;

/// <summary>
/// .NET port of the Next.js reference's DDA/narcotic register (<c>dda_narcotic_register</c> view,
/// served by <c>getDdaNarcoticRegister</c>) — see <see cref="GetNarcoticRegisterQuery"/> for the
/// faithfulness gap against fields the ported schema doesn't carry (prescription number, doctor
/// license, schedule, strength/form).
///
/// Composes across modules through Contracts-only Mediator queries (architecture.md — a module may
/// reference another only through its `.Contracts` project): the controlled-medicine set from
/// Inventory, and per-distinct-id customer/prescription lookups from Customers/Prescriptions. Lookups
/// are batched to the distinct ids referenced by the period's dispensing rows — bounded by how many
/// customers/prescriptions appear in the register, not by total dispensing volume.
/// </summary>
public sealed class GetNarcoticRegisterQueryHandler(SalesDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetNarcoticRegisterQuery, PagedResponse<NarcoticRegisterRowDto>>
{
    public async ValueTask<PagedResponse<NarcoticRegisterRowDto>> Handle(
        GetNarcoticRegisterQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var controlledAll = await mediator.Send(new GetControlledMedicinesQuery(), cancellationToken).ConfigureAwait(false);

        // Schedule filter: case-insensitive exact match on the medicine's ControlledSchedule. Applied to the
        // controlled set so non-matching medicines never reach the dispensing query.
        var controlled = string.IsNullOrWhiteSpace(query.Schedule)
            ? controlledAll
            : controlledAll
                .Where(m => string.Equals(m.ControlledSchedule, query.Schedule.Trim(), StringComparison.OrdinalIgnoreCase))
                .ToList();
        if (controlled.Count == 0)
        {
            return EmptyPage(page, size);
        }

        var controlledById = controlled.ToDictionary(m => m.MedicineId);
        var controlledIds = controlled.Select(m => m.MedicineId).ToList();

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var dispensed = await (
            from item in dbContext.SaleItems.AsNoTracking()
            join sale in dbContext.Sales.AsNoTracking() on item.SaleId equals sale.Id
            where sale.Status == SaleStatus.Completed
                && sale.SaleDateUtc >= query.PeriodStartUtc
                && sale.SaleDateUtc <= query.PeriodEndUtc
                && controlledIds.Contains(item.MedicineId)
                && (branchId == null || sale.BranchId == branchId)
            orderby sale.SaleDateUtc
            select new { Sale = sale, Item = item })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (dispensed.Count == 0)
        {
            return EmptyPage(page, size);
        }

        var customerIds = dispensed.Select(d => d.Sale.CustomerId).Where(id => id.HasValue).Select(id => id!.Value).Distinct().ToList();
        var prescriptionIds = dispensed.Select(d => d.Sale.PrescriptionId).Where(id => id.HasValue).Select(id => id!.Value).Distinct().ToList();

        var customerNames = await LoadCustomerNamesAsync(customerIds, cancellationToken).ConfigureAwait(false);
        var doctorNames = await LoadDoctorNamesAsync(prescriptionIds, cancellationToken).ConfigureAwait(false);

        var rows = dispensed
            .Select(d =>
            {
                var medicine = controlledById[d.Item.MedicineId];
                return new NarcoticRegisterRowDto(
                    d.Sale.Id,
                    d.Sale.SaleDateUtc,
                    d.Sale.CustomerId,
                    d.Sale.CustomerId.HasValue ? customerNames.GetValueOrDefault(d.Sale.CustomerId.Value) : null,
                    d.Sale.PrescriptionId,
                    d.Sale.PrescriptionId.HasValue ? doctorNames.GetValueOrDefault(d.Sale.PrescriptionId.Value) : null,
                    d.Item.Id,
                    d.Item.MedicineId,
                    medicine.MedicineName,
                    medicine.GenericName,
                    d.Item.Quantity,
                    d.Item.UnitPrice,
                    d.Item.LineTotal,
                    d.Sale.BranchId);
            })
            .ToList();

        if (!string.IsNullOrWhiteSpace(query.MedicineName))
        {
            rows = rows
                .Where(r => r.MedicineName is not null && r.MedicineName.Contains(query.MedicineName, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        if (!string.IsNullOrWhiteSpace(query.DoctorName))
        {
            rows = rows
                .Where(r => r.DoctorName is not null && r.DoctorName.Contains(query.DoctorName, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        int totalCount = rows.Count;
        var pageItems = rows
            .Skip((page - 1) * size)
            .Take(size)
            .ToList();

        return new PagedResponse<NarcoticRegisterRowDto>
        {
            Items = pageItems,
            PageNumber = page,
            PageSize = size,
            TotalCount = totalCount,
            TotalPages = (int)Math.Ceiling(totalCount / (double)size),
        };
    }

    private static PagedResponse<NarcoticRegisterRowDto> EmptyPage(int page, int size) => new()
    {
        Items = [],
        PageNumber = page,
        PageSize = size,
        TotalCount = 0,
        TotalPages = 0,
    };

    /// <summary>Batch lookup that includes soft-deleted customers (tenant-filtered): the register must keep
    /// the patient's name after the customer is deleted.</summary>
    private async Task<Dictionary<Guid, string>> LoadCustomerNamesAsync(IReadOnlyList<Guid> customerIds, CancellationToken ct)
    {
        var result = new Dictionary<Guid, string>();
        foreach (var chunk in customerIds.Chunk(LookupCustomersQuery.MaxIds))
        {
            var rows = await mediator.Send(new LookupCustomersQuery(chunk, null, chunk.Length), ct).ConfigureAwait(false);
            foreach (var row in rows)
            {
                result[row.Id] = row.Name;
            }
        }

        return result;
    }

    private async Task<Dictionary<Guid, string>> LoadDoctorNamesAsync(IReadOnlyList<Guid> prescriptionIds, CancellationToken ct)
    {
        var result = new Dictionary<Guid, string>();
        foreach (var id in prescriptionIds)
        {
            try
            {
                var prescription = await mediator.Send(new GetPrescriptionByIdQuery(id), ct).ConfigureAwait(false);
                result[id] = prescription.DoctorName;
            }
            catch (NotFoundException)
            {
                // Prescription since deleted/purged — leave unresolved rather than fail the whole register.
            }
        }

        return result;
    }
}
