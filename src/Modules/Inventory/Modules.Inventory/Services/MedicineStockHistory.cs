using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Whether a medicine already has stock on record, and which of its details that freezes. Once any lot
/// was received (purchase, opening stock, transfer, bulk import) or any stock moved (sale, return,
/// adjustment), the books and the stock ledger were written against what the medicine is and its unit of
/// count:
/// <list type="bullet">
/// <item><b>Strength / form</b> — they say which product the recorded stock is, and invoices show the
/// medicine's current details: 500 mg tablets relabelled as 650 mg syrup would rewrite every past bill.
/// Spacing and case fixes are still allowed; the name stays editable for spelling fixes.</item>
/// <item><b>Units per pack / unit label</b> — every lot quantity, sale line and ledger row is counted in
/// that unit; relabelling it changes what the recorded quantities mean.</item>
/// <item><b>Supplier invoice number / VAT amount</b> — the opening receipt's bill, already posted to the
/// supplier's account and the purchase register.</item>
/// </list>
/// The VAT flag is not frozen: sale lines and stock lots keep the flag they were recorded under
/// (<see cref="MedicineBatch.IsTaxable"/>), so a correction only applies from then on. Stock and lot costs
/// never change through the medicine form at all: they move through Add stock / Adjust (or a purchase), which
/// post to the books.
/// </summary>
public static class MedicineStockHistory
{
    public const string StrengthField = "Strength";
    public const string FormField = "Form";
    public const string UnitsPerPackField = "Units per pack";
    public const string UnitLabelField = "Unit label";
    public const string SupplierInvoiceField = "Supplier invoice number";
    public const string VatAmountField = "VAT amount";

    /// <summary>True when any lot (any branch, disposed included) or any ledger movement exists for the medicine.</summary>
    public static async Task<bool> HasAnyAsync(InventoryDbContext dbContext, Guid medicineId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        bool hasLot = await dbContext.MedicineBatches.AsNoTracking()
            .AnyAsync(b => b.MedicineId == medicineId, cancellationToken)
            .ConfigureAwait(false);
        if (hasLot)
        {
            return true;
        }

        return await dbContext.InventoryTransactions.AsNoTracking()
            .AnyAsync(t => t.MedicineId == medicineId, cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>
    /// The locked details this update would change, by display name. A value the command omits (null) keeps
    /// the stored one, and <see cref="UpdateMedicineCommand.ClearOptionalDetails"/> does not clear locked
    /// details (the handler keeps them), so only an explicit different value counts. The supplier invoice and
    /// VAT describe the new lot's bill when the same request receives stock, so they are not checked then.
    /// </summary>
    public static IReadOnlyList<string> LockedChanges(Medicine medicine, UpdateMedicineCommand command)
    {
        ArgumentNullException.ThrowIfNull(medicine);
        ArgumentNullException.ThrowIfNull(command);

        var changed = new List<string>();
        if (IdentityChanged(command.Strength, medicine.Strength))
        {
            changed.Add(StrengthField);
        }

        if (IdentityChanged(command.Form, medicine.Form))
        {
            changed.Add(FormField);
        }

        if (command.UnitsPerPack is { } unitsPerPack && unitsPerPack != medicine.UnitsPerPack)
        {
            changed.Add(UnitsPerPackField);
        }

        if (TextChanged(command.UnitLabel, medicine.UnitLabel))
        {
            changed.Add(UnitLabelField);
        }

        bool receivesStock = command.InitialStockQuantity is > 0;
        if (!receivesStock)
        {
            if (TextChanged(command.SupplierInvoiceNumber, medicine.SupplierInvoiceNumber))
            {
                changed.Add(SupplierInvoiceField);
            }

            if (command.VatAmount is { } vat && vat != medicine.VatAmount)
            {
                changed.Add(VatAmountField);
            }
        }

        return changed;
    }

    /// <summary>Rejects the update with 409 when it would change a locked detail of a medicine with stock history.</summary>
    public static void EnsureNoLockedChanges(Medicine medicine, UpdateMedicineCommand command)
    {
        var changed = LockedChanges(medicine, command);
        if (changed.Count == 0)
        {
            return;
        }

        throw new CustomException(
            $"{string.Join(", ", changed)} can't be changed: this medicine already has stock or sales on record, "
            + "and those were recorded with the current value. Create a new medicine for a different product or pack.",
            (IEnumerable<string>?)null, HttpStatusCode.Conflict);
    }

    /// <summary>Text compare the way Medicine stores it: trimmed, blank = none; an omitted (null) value keeps the stored one.</summary>
    private static bool TextChanged(string? requested, string? stored) =>
        requested is not null && !string.Equals(Blank(requested), Blank(stored), StringComparison.Ordinal);

    /// <summary>Strength / form compared the way duplicates are found: spacing and case don't make a different product.</summary>
    private static bool IdentityChanged(string? requested, string? stored) =>
        requested is not null
        && !string.Equals(MedicineIdentityGuard.CompactKey(requested), MedicineIdentityGuard.CompactKey(stored), StringComparison.Ordinal);

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
