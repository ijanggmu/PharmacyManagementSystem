using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Prescriptions.Services;

/// <summary>
/// The prescription gate for sales.
/// <list type="number">
/// <item><see cref="EnsureDispensableAsync"/>: a fast pre-check before the sale's transaction opens (no lock).</item>
/// <item><see cref="ConsumeForSaleAsync"/>: the authoritative check-and-record, inside the sale's transaction
/// under a row lock on the prescription's items, so concurrent sales can't both pass against the same
/// remaining quantity / fills.</item>
/// <item><see cref="ReconcileSaleDispenseAsync"/>: the SaleCompleted handler's idempotent reconciliation.
/// A no-op when the sale already consumed the prescription; records sales completed before synchronous
/// consumption existed, and logs (rather than dead-letters) one that no longer fits.</item>
/// </list>
/// </summary>
public sealed partial class DispensingSafetyPolicy(
    PrescriptionsDbContext dbContext,
    IControlledMedicineChecker controlledMedicineChecker,
    TimeProvider timeProvider,
    AmbientDbTransactionRegistry ambientTransactions,
    ICurrentUser currentUser,
    ILogger<DispensingSafetyPolicy> logger) : IDispensingSafetyPolicy
{
    private readonly Dictionary<Guid, MedicineDispensingFlags> _flagCache = [];

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

        var prescription = await dbContext.Prescriptions
            .AsNoTracking()
            .Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == prescriptionId.Value, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new DispensingSafetyException($"Prescription {prescriptionId} not found.");

        ValidatePrescriptionFor(prescription, customerId);

        // Accumulate per medicine across ALL controlled lines of the sale before checking, so two
        // lines for the same medicine cannot each pass against the same RemainingQuantity.
        foreach (var group in AccumulateByMedicine(controlledLines))
        {
            var item = prescription.FindItem(group.Key)
                ?? throw new DispensingSafetyException($"Prescription {prescriptionId} has no entry for medicine {group.Key}.");

            ValidateItemCanDispense(item, prescriptionId.Value, group.Value);
        }
    }

    public async ValueTask ConsumeForSaleAsync(
        Guid saleId, Guid? prescriptionId, Guid customerId, IReadOnlyList<DispenseCheckLine> lines,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(lines);

        var controlledLines = await GetPrescriptionRequiredLinesAsync(lines, cancellationToken).ConfigureAwait(false);
        if (controlledLines.Count == 0)
        {
            return;
        }

        if (prescriptionId is not { } id)
        {
            throw new DispensingSafetyException(
                "One or more items require a linked, unexpired prescription and none was provided.");
        }

        var totals = AccumulateByMedicine(controlledLines);
        await PrescriptionWrites.RunInTransactionAsync(dbContext, ambientTransactions, async ct =>
        {
            // Drop anything tracked earlier in this scope: the values must be read after the lock.
            dbContext.ChangeTracker.Clear();

            if (await AlreadyConsumedAsync(saleId, ct).ConfigureAwait(false))
            {
                return;
            }

            await PrescriptionWrites.LockItemsAsync(dbContext, [id], ct).ConfigureAwait(false);
            var prescription = await LoadPrescriptionAsync(id, ct).ConfigureAwait(false);
            ValidatePrescriptionFor(prescription, customerId);

            await RecordSaleDispenseAsync(prescription, saleId, totals, ct).ConfigureAwait(false);
        }, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// SaleCompleted reconciliation (idempotent). Nothing to do when the sale already consumed the
    /// prescription in its own transaction. Otherwise (a sale recorded before synchronous consumption) the
    /// dispense is recorded now; if it no longer fits (the sale already happened, so refusing is pointless)
    /// it is logged as a warning instead of failing the event forever.
    /// </summary>
    public async ValueTask ReconcileSaleDispenseAsync(
        Guid saleId, Guid prescriptionId, IReadOnlyList<DispenseCheckLine> lines, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(lines);

        var controlledLines = await GetPrescriptionRequiredLinesAsync(lines, cancellationToken).ConfigureAwait(false);
        if (controlledLines.Count == 0)
        {
            return;
        }

        var totals = AccumulateByMedicine(controlledLines);
        await PrescriptionWrites.RunInTransactionAsync(dbContext, ambientTransactions, async ct =>
        {
            dbContext.ChangeTracker.Clear();

            if (await AlreadyConsumedAsync(saleId, ct).ConfigureAwait(false))
            {
                return;
            }

            await PrescriptionWrites.LockItemsAsync(dbContext, [prescriptionId], ct).ConfigureAwait(false);
            var prescription = await dbContext.Prescriptions
                .Include(p => p.Items)
                .FirstOrDefaultAsync(p => p.Id == prescriptionId, ct)
                .ConfigureAwait(false);
            if (prescription is null)
            {
                LogReconcileSkipped(logger, prescriptionId, saleId, "prescription not found");
                return;
            }

            try
            {
                await RecordSaleDispenseAsync(prescription, saleId, totals, ct).ConfigureAwait(false);
            }
            catch (DispensingSafetyException ex)
            {
                LogReconcileSkipped(logger, prescriptionId, saleId, ex.Message);
            }
        }, cancellationToken).ConfigureAwait(false);
    }

    private Task<bool> AlreadyConsumedAsync(Guid saleId, CancellationToken cancellationToken) =>
        dbContext.PrescriptionRefills.AnyAsync(r => r.SaleId == saleId, cancellationToken);

    /// <summary>Validates every medicine before mutating any (no partial record), then records one fill per
    /// item with a sale-stamped refill row, and saves.</summary>
    private async ValueTask RecordSaleDispenseAsync(
        Prescription prescription, Guid saleId, Dictionary<Guid, decimal> totals, CancellationToken cancellationToken)
    {
        foreach (var (medicineId, quantity) in totals)
        {
            var item = prescription.FindItem(medicineId)
                ?? throw new DispensingSafetyException($"Prescription {prescription.Id} has no entry for medicine {medicineId}.");
            ValidateItemCanDispense(item, prescription.Id, quantity);
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var userId = currentUser.GetUserId();
        Guid? dispensedBy = userId == Guid.Empty ? null : userId;
        foreach (var (medicineId, quantity) in totals)
        {
            try
            {
                prescription.RecordSaleDispense(medicineId, quantity, saleId, now, dispensedBy);
            }
            catch (CustomException ex) when (ex is not DispensingSafetyException)
            {
                throw new DispensingSafetyException(ex.Message, ex);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    private void ValidatePrescriptionFor(Prescription prescription, Guid customerId)
    {
        if (prescription.CustomerId != customerId)
        {
            throw new DispensingSafetyException("The prescription does not belong to this customer.");
        }

        var today = NepalClock.Today(timeProvider);
        if (!prescription.IsValidAsOf(today))
        {
            throw new DispensingSafetyException($"Prescription {prescription.Id} is expired or cancelled.");
        }
    }

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Prescription {PrescriptionId} not updated for completed sale {SaleId}: {Reason}. Review its dispensed quantities.")]
    private static partial void LogReconcileSkipped(ILogger logger, Guid prescriptionId, Guid saleId, string reason);

    public async ValueTask RecordDispenseAsync(
        Guid prescriptionId, IReadOnlyList<DispenseCheckLine> lines, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(lines);

        var controlledLines = await GetPrescriptionRequiredLinesAsync(lines, cancellationToken).ConfigureAwait(false);
        if (controlledLines.Count == 0)
        {
            return;
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
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
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

        // Flags are cached for the scope: the sale's pre-check (before its transaction) loads them, so the
        // consumption inside the transaction doesn't run another module's query on the shared connection.
        var missing = lines.Select(l => l.MedicineId).Distinct().Where(id => !_flagCache.ContainsKey(id)).ToList();
        if (missing.Count > 0)
        {
            var loaded = await controlledMedicineChecker.GetDispensingFlagsAsync(missing, cancellationToken).ConfigureAwait(false);
            foreach (var id in missing)
            {
                // A medicine the checker doesn't know is cached as not gated, same as before (no entry = not gated).
                _flagCache[id] = loaded.TryGetValue(id, out var f) ? f : new MedicineDispensingFlags(false, false);
            }
        }

        var flags = _flagCache;

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
