using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Services;

public sealed class DispensingSafetyPolicy(
    PrescriptionsDbContext dbContext,
    IControlledMedicineChecker controlledMedicineChecker,
    TimeProvider timeProvider) : IDispensingSafetyPolicy
{
    public async ValueTask EnsureDispensableAsync(
        IReadOnlyList<DispenseCheckLine> lines, Guid? prescriptionId, Guid customerId,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(lines);

        var controlledLines = await GetPrescriptionRequiredLinesAsync(lines, cancellationToken).ConfigureAwait(false);
        if (controlledLines.Count == 0)
        {
            return;
        }

        if (prescriptionId is null)
        {
            throw new DispensingSafetyException(
                "One or more items require a linked, unexpired prescription and none was provided.");
        }

        var prescription = await LoadPrescriptionAsync(prescriptionId.Value, cancellationToken).ConfigureAwait(false);

        if (prescription.CustomerId != customerId)
        {
            throw new DispensingSafetyException("The prescription does not belong to this customer.");
        }

        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        if (!prescription.IsValidAsOf(today))
        {
            throw new DispensingSafetyException($"Prescription {prescriptionId} is expired or cancelled.");
        }

        // Accumulate per medicine across ALL controlled lines of the sale before checking, so two
        // lines for the same medicine cannot each pass against the same RemainingQuantity.
        foreach (var group in AccumulateByMedicine(controlledLines))
        {
            var item = prescription.FindItem(group.Key)
                ?? throw new DispensingSafetyException($"Prescription {prescriptionId} has no entry for medicine {group.Key}.");

            ValidateItemCanDispense(item, prescriptionId.Value, group.Value);
        }
    }

    public async ValueTask RecordDispenseAsync(
        Guid prescriptionId, IReadOnlyList<DispenseCheckLine> lines, Guid? saleId = null,
        bool joinCallerTransaction = false, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(lines);

        if (saleId is { } recordedSale && await dbContext.PrescriptionDispenseEntries
                .AnyAsync(e => e.SaleId == recordedSale && e.ReferenceType == PrescriptionDispenseEntry.SaleReference, cancellationToken)
                .ConfigureAwait(false))
        {
            return;
        }

        var controlledLines = await GetPrescriptionRequiredLinesAsync(lines, cancellationToken).ConfigureAwait(false);
        if (controlledLines.Count == 0)
        {
            return;
        }

        if (joinCallerTransaction)
        {
            // A retried sale transaction must start from database state, and the lock makes a concurrent sale of
            // the same prescription wait until this one commits, then see what it dispensed.
            dbContext.ChangeTracker.Clear();
            await LockPrescriptionRowAsync(prescriptionId, cancellationToken).ConfigureAwait(false);
        }

        var prescription = await LoadPrescriptionAsync(prescriptionId, cancellationToken).ConfigureAwait(false);
        var totals = AccumulateByMedicine(controlledLines);

        // Validate every item before mutating any of them, so a rejection never leaves a
        // partially recorded sale and never surfaces as a non-DispensingSafetyException.
        var plan = new List<(PrescriptionItem Item, decimal Quantity)>(totals.Count);
        foreach (var (medicineId, quantity) in totals)
        {
            var item = prescription.FindItem(medicineId)
                ?? throw new DispensingSafetyException($"Prescription {prescriptionId} has no entry for medicine {medicineId}.");

            ValidateItemCanDispense(item, prescriptionId, quantity);
            plan.Add((item, quantity));
        }

        foreach (var (item, quantity) in plan)
        {
            try
            {
                item.RecordDispense(quantity);
            }
            catch (CustomException ex) when (ex is not DispensingSafetyException)
            {
                throw new DispensingSafetyException(ex.Message, ex);
            }

            if (saleId is { } sale)
            {
                dbContext.PrescriptionDispenseEntries.Add(PrescriptionDispenseEntry.Create(
                    sale, prescription.Id, item.Id, item.MedicineId, quantity, refillDelta: 1,
                    PrescriptionDispenseEntry.SaleReference, sale));
            }
        }

        if (!joinCallerTransaction || !dbContext.Database.IsRelational())
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return;
        }

        // Join the caller's transaction on the shared connection (Npgsql runs every command inside it); EF's own
        // transaction is switched off so it doesn't try to open a nested one.
        var previous = dbContext.Database.AutoTransactionBehavior;
        dbContext.Database.AutoTransactionBehavior = AutoTransactionBehavior.Never;
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            dbContext.Database.AutoTransactionBehavior = previous;
        }
    }

    private async Task LockPrescriptionRowAsync(Guid prescriptionId, CancellationToken cancellationToken)
    {
        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        // Tenant-filtered existence check first, so the raw lock never touches another tenant's row.
        bool visible = await dbContext.Prescriptions.AsNoTracking()
            .AnyAsync(p => p.Id == prescriptionId, cancellationToken)
            .ConfigureAwait(false);
        if (!visible)
        {
            return;
        }

        _ = await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM prescriptions."Prescriptions" WHERE "Id" = {prescriptionId} FOR UPDATE
            """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Lines that need a linked, valid prescription: the medicine is controlled (scheduled/narcotic)
    /// OR prescription-only (<c>PrescriptionRequired</c>). Legacy <c>create_sale_with_items</c> enforces
    /// the same rule for every <c>prescription_required</c> medicine, not just controlled ones.
    /// </summary>
    private async ValueTask<List<DispenseCheckLine>> GetPrescriptionRequiredLinesAsync(
        IReadOnlyList<DispenseCheckLine> lines, CancellationToken cancellationToken)
    {
        if (lines.Count == 0)
        {
            return [];
        }

        var medicineIds = lines.Select(l => l.MedicineId).Distinct().ToList();
        var flags = await controlledMedicineChecker.GetDispensingFlagsAsync(medicineIds, cancellationToken).ConfigureAwait(false);

        return lines
            .Where(l => flags.TryGetValue(l.MedicineId, out var f) && (f.IsControlled || f.PrescriptionRequired))
            .ToList();
    }

    private async ValueTask<Prescription> LoadPrescriptionAsync(Guid prescriptionId, CancellationToken cancellationToken) =>
        await dbContext.Prescriptions
            .Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == prescriptionId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new DispensingSafetyException($"Prescription {prescriptionId} not found.");

    private static Dictionary<Guid, decimal> AccumulateByMedicine(IEnumerable<DispenseCheckLine> controlledLines)
    {
        var totals = new Dictionary<Guid, decimal>();
        foreach (var line in controlledLines)
        {
            totals[line.MedicineId] = totals.TryGetValue(line.MedicineId, out var sum) ? sum + line.Quantity : line.Quantity;
        }

        return totals;
    }

    private static void ValidateItemCanDispense(PrescriptionItem item, Guid prescriptionId, decimal requestedQuantity)
    {
        if (item.RefillsUsed >= item.RefillsAllowed + 1)
        {
            throw new DispensingSafetyException($"No refills remaining on prescription {prescriptionId} for medicine {item.MedicineId}.");
        }

        if (requestedQuantity > item.RemainingQuantity)
        {
            throw new DispensingSafetyException(
                $"Prescription {prescriptionId} only has {item.RemainingQuantity} remaining for medicine {item.MedicineId}, requested {requestedQuantity}.");
        }
    }
}
