using System.Globalization;
using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Domain;

namespace FSH.Modules.Inventory.Features.v1.Medicines.ImportOpeningStock;

/// <summary>A medicine the import can match a row to.</summary>
public sealed record OpeningStockMedicine(Guid Id, string Name, string? Strength, string? Form, string? Barcode)
{
    public string Label => string.Join(' ', new[] { Name, Strength, Form }.Where(p => !string.IsNullOrWhiteSpace(p)));
}

/// <summary>A live lot at the importing branch (batch number in canonical form).</summary>
public sealed record OpeningStockLot(Guid MedicineId, string BatchNo, DateOnly ExpiryDate, decimal QuantityOnHand, bool IsConsigned);

/// <summary>What the import will do with one row: the medicine and canonical batch number it resolved to.
/// <see cref="NewMedicine"/>: <see cref="Medicine"/> is a placeholder (shared by the rows naming the same new
/// medicine) that the import creates. <see cref="Consigned"/>: the row is a supplier's consignment.</summary>
public sealed record OpeningStockPlanRow(
    OpeningStockImportRow Row,
    string Status,
    OpeningStockMedicine? Medicine,
    string? BatchNo,
    IReadOnlyList<OpeningStockImportError> Errors,
    IReadOnlyList<string> Warnings,
    bool NewMedicine = false,
    bool Consigned = false);

/// <summary>
/// Per-row field rules of an opening-stock import. Property names are the template's column keys.
/// </summary>
/// <remarks>Internal so assembly scanning doesn't register it in DI (it's built per import with that day's date).</remarks>
internal sealed class OpeningStockImportRowValidator : AbstractValidator<OpeningStockImportRow>
{
    public OpeningStockImportRowValidator(DateOnly today)
    {
        RuleFor(x => x)
            .Must(r => r.MedicineId is not null || !string.IsNullOrWhiteSpace(r.Barcode) || !string.IsNullOrWhiteSpace(r.MedicineName))
            .WithMessage("Say which medicine: its barcode, or its name (with strength and form).")
            .OverridePropertyName("medicine");
        RuleFor(x => x.Quantity).GreaterThan(0m).WithMessage("Quantity must be more than 0.")
            .LessThanOrEqualTo(OpeningStockImportLimits.MaxQuantity)
            .WithMessage($"Quantity can't be more than {OpeningStockImportLimits.MaxQuantity:N0} on one row.")
            .OverridePropertyName("quantity");
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0m).WithMessage("Cost price can't be negative.")
            .PrecisionScale(18, 4, ignoreTrailingZeros: true).WithMessage("Cost price can have at most 4 decimal places.")
            .OverridePropertyName("cost_price");
        RuleFor(x => x.SellingPrice).GreaterThanOrEqualTo(0m).When(x => x.SellingPrice is not null)
            .WithMessage("Selling price can't be negative.")
            .OverridePropertyName("selling_price");
        RuleFor(x => x.BatchNo).MaximumLength(64).OverridePropertyName("batch_no");
        RuleFor(x => x.RackLocation).MaximumLength(64).OverridePropertyName("rack");
        RuleFor(x => x.ExpiryDate)
            .Must(d => d is null || d >= today)
            .WithMessage("Already expired — leave expired stock out of the import (return or dispose of it separately).")
            .OverridePropertyName("expiry_date");
        RuleFor(x => x.GenericName).MaximumLength(200).OverridePropertyName("generic_name");
        RuleFor(x => x.UnitsPerPack).GreaterThanOrEqualTo(1).When(x => x.UnitsPerPack is not null)
            .WithMessage("Pack size must be 1 or more.")
            .OverridePropertyName("units_per_pack");
        RuleFor(x => x.ReorderLevel).GreaterThanOrEqualTo(0m).When(x => x.ReorderLevel is not null)
            .WithMessage("Reorder level can't be negative.")
            .OverridePropertyName("reorder_level");
    }
}

/// <summary>
/// Pure planning step of an opening-stock import: field rules, which medicine each row means, and whether its lot
/// is new, tops up an existing lot (same batch number at this branch — its expiry must match), or can't take owned
/// stock (a consigned lot). A consignment import never tops up: each row needs a lot
/// of its own, so settlement bills only what sold from it. Nothing here touches the database.
/// </summary>
public static class OpeningStockImportPlanner
{
    public static IReadOnlyList<OpeningStockPlanRow> Plan(
        IReadOnlyList<OpeningStockImportRow> rows,
        IReadOnlyCollection<OpeningStockMedicine> medicines,
        IReadOnlyCollection<OpeningStockLot> lots,
        DateOnly today,
        bool consignment = false,
        bool createMissingMedicines = false)
    {
        ArgumentNullException.ThrowIfNull(rows);
        ArgumentNullException.ThrowIfNull(medicines);
        ArgumentNullException.ThrowIfNull(lots);

        var validator = new OpeningStockImportRowValidator(today);
        var byId = medicines.ToDictionary(m => m.Id);
        var byBarcode = medicines
            .Where(m => !string.IsNullOrWhiteSpace(m.Barcode))
            .GroupBy(m => m.Barcode!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var byIdentity = medicines
            .GroupBy(m => IdentityKey(m.Name, m.Strength, m.Form), StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.Ordinal);
        var lotByKey = lots
            .GroupBy(l => (l.MedicineId, l.BatchNo))
            .ToDictionary(g => g.Key, g => g.First());

        // The first row of the file naming each (medicine, batch): later rows add to it and must agree on the expiry.
        var seenLots = new Dictionary<(Guid MedicineId, string BatchNo), (int RowNumber, DateOnly? Expiry, bool Consigned)>();

        // Medicines the file creates: one placeholder per name + strength + form, and the barcode each one claims.
        var newByIdentity = new Dictionary<string, OpeningStockMedicine>(StringComparer.Ordinal);
        var newByBarcode = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var plan = new List<OpeningStockPlanRow>(rows.Count);
        foreach (var row in rows)
        {
            var errors = validator.Validate(row).Errors
                .Select(f => new OpeningStockImportError(f.PropertyName, f.ErrorMessage))
                .ToList();
            var warnings = new List<string>();

            bool consigned = consignment || row.ConsignmentSupplierId is not null;
            var medicine = Resolve(row, byId, byBarcode, byIdentity, errors, createMissingMedicines, out bool missing);
            bool newMedicine = false;
            if (missing)
            {
                medicine = NewMedicine(row, newByIdentity, newByBarcode, errors);
                newMedicine = medicine is not null;
            }

            string? batchNo = string.IsNullOrWhiteSpace(row.BatchNo) ? null : MedicineBatch.NormalizeBatchNo(row.BatchNo);

            if (medicine is not null && batchNo is not null)
            {
                var key = (medicine.Id, batchNo);
                if (lotByKey.TryGetValue(key, out var lot))
                {
                    if (consigned)
                    {
                        errors.Add(new OpeningStockImportError(
                            "batch_no",
                            $"Batch {batchNo} is already in stock for this medicine at this branch. Consigned stock is kept as its own lot — use a different batch number, or leave it blank to generate one."));
                    }
                    else if (lot.IsConsigned)
                    {
                        errors.Add(new OpeningStockImportError(
                            "batch_no",
                            $"Batch {batchNo} is consignment stock (owned by the supplier until sold) — import this stock under a different batch number."));
                    }
                    else if (row.ExpiryDate is { } expiry && expiry != lot.ExpiryDate)
                    {
                        errors.Add(new OpeningStockImportError(
                            "expiry_date",
                            string.Format(
                                CultureInfo.InvariantCulture,
                                "Batch {0} already exists with expiry {1}, but the file says {2:yyyy-MM-dd}. Check the batch number or the expiry date.",
                                batchNo, FormatExpiry(lot.ExpiryDate), expiry)));
                    }
                    else
                    {
                        warnings.Add(string.Format(
                            CultureInfo.InvariantCulture,
                            "Batch {0} is already in stock ({1:0.###} on hand); this row adds {2:0.###} more. If this file was imported before, leave the row out or the stock is counted twice.",
                            batchNo, lot.QuantityOnHand, row.Quantity));
                    }
                }

                if (seenLots.TryGetValue(key, out var earlier))
                {
                    if (consigned || earlier.Consigned)
                    {
                        errors.Add(new OpeningStockImportError(
                            "batch_no",
                            $"Row {earlier.RowNumber} already has batch {batchNo} of this medicine — put each consigned batch on one row."));
                    }
                    else if (earlier.Expiry is { } a && row.ExpiryDate is { } b && a != b)
                    {
                        errors.Add(new OpeningStockImportError(
                            "expiry_date",
                            $"Row {earlier.RowNumber} has batch {batchNo} of this medicine with a different expiry."));
                    }
                }
                else
                {
                    seenLots[key] = (row.RowNumber, row.ExpiryDate, consigned);
                }
            }

            if (errors.Count == 0)
            {
                if (newMedicine)
                {
                    warnings.Add($"New medicine — {medicine!.Label} will be added to your list.");
                }

                if (batchNo is null)
                {
                    warnings.Add("No batch number — one will be generated.");
                }

                if (row.ExpiryDate is null)
                {
                    warnings.Add("No expiry date — stored as non-expiring.");
                }

                if (row.CostPrice == 0m)
                {
                    warnings.Add(consigned
                        ? "Cost price is 0 — the supplier is billed nothing when this stock sells."
                        : "Cost price is 0 — this stock adds nothing to the inventory value in the books.");
                }
            }

            plan.Add(new OpeningStockPlanRow(
                row,
                errors.Count > 0 ? OpeningStockImportRowStatuses.Failed : OpeningStockImportRowStatuses.Received,
                medicine,
                batchNo,
                errors,
                warnings,
                newMedicine,
                consigned));
        }

        return plan;
    }

    /// <summary>The placeholder for a medicine the file creates — the same one for every row naming it — or null with
    /// the reason when the row can't describe a new medicine.</summary>
    private static OpeningStockMedicine? NewMedicine(
        OpeningStockImportRow row,
        Dictionary<string, OpeningStockMedicine> newByIdentity,
        Dictionary<string, string> newByBarcode,
        List<OpeningStockImportError> errors)
    {
        int before = errors.Count;
        if (string.IsNullOrWhiteSpace(row.Form))
        {
            errors.Add(new OpeningStockImportError("form", "A new medicine needs its form (Tablet, Syrup, ...)."));
        }

        if (row.SellingPrice is not > 0m)
        {
            errors.Add(new OpeningStockImportError("selling_price", "A new medicine needs its selling price (MRP)."));
        }

        if ((row.MedicineName ?? string.Empty).Trim().Length > 200)
        {
            errors.Add(new OpeningStockImportError("medicine_name", "Medicine name can be at most 200 characters."));
        }

        string identity = IdentityKey(row.MedicineName, row.Strength, row.Form);
        string? barcode = string.IsNullOrWhiteSpace(row.Barcode) ? null : row.Barcode.Trim();
        if (barcode is not null && newByBarcode.TryGetValue(barcode, out var claimedBy) && claimedBy != identity)
        {
            errors.Add(new OpeningStockImportError("barcode", $"Barcode {barcode} is already on another new medicine in this file."));
        }

        if (errors.Count > before)
        {
            return null;
        }

        if (!newByIdentity.TryGetValue(identity, out var medicine))
        {
            medicine = new OpeningStockMedicine(
                Guid.CreateVersion7(),
                row.MedicineName!.Trim(),
                string.IsNullOrWhiteSpace(row.Strength) ? null : row.Strength.Trim(),
                row.Form!.Trim(),
                barcode);
            newByIdentity[identity] = medicine;
        }

        if (barcode is not null)
        {
            newByBarcode.TryAdd(barcode, identity);
        }

        return medicine;
    }

    /// <summary>Name + strength + form, compared like <c>MedicineIdentityGuard</c> (case-insensitive, strength/form without spaces).</summary>
    public static string IdentityKey(string? name, string? strength, string? form) =>
        string.Join('|',
            (name ?? string.Empty).Trim().ToUpperInvariant(),
            (strength ?? string.Empty).Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant(),
            (form ?? string.Empty).Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant());

    private static OpeningStockMedicine? Resolve(
        OpeningStockImportRow row,
        Dictionary<Guid, OpeningStockMedicine> byId,
        Dictionary<string, OpeningStockMedicine> byBarcode,
        Dictionary<string, List<OpeningStockMedicine>> byIdentity,
        List<OpeningStockImportError> errors,
        bool createMissing,
        out bool missing)
    {
        missing = false;
        if (row.MedicineId is { } id)
        {
            if (byId.TryGetValue(id, out var medicine))
            {
                return medicine;
            }

            errors.Add(new OpeningStockImportError("medicine_id", "No medicine with this id (it may have been deleted)."));
            return null;
        }

        if (!string.IsNullOrWhiteSpace(row.Barcode))
        {
            if (byBarcode.TryGetValue(row.Barcode.Trim(), out var medicine))
            {
                return medicine;
            }

            if (string.IsNullOrWhiteSpace(row.MedicineName))
            {
                errors.Add(new OpeningStockImportError(
                    "barcode",
                    createMissing
                        ? $"No medicine has barcode {row.Barcode.Trim()} — add its name, strength and form to create it."
                        : $"No medicine has barcode {row.Barcode.Trim()}."));
                return null;
            }
        }

        if (string.IsNullOrWhiteSpace(row.MedicineName))
        {
            return null;
        }

        string described = string.Join(' ', new[] { row.MedicineName, row.Strength, row.Form }.Where(p => !string.IsNullOrWhiteSpace(p))).Trim();
        if (!byIdentity.TryGetValue(IdentityKey(row.MedicineName, row.Strength, row.Form), out var matches) || matches.Count == 0)
        {
            if (createMissing)
            {
                missing = true;
                return null;
            }

            errors.Add(new OpeningStockImportError(
                "medicine_name",
                $"No medicine \"{described}\" — check the name, strength and form, or add the medicine first."));
            return null;
        }

        if (matches.Count > 1)
        {
            errors.Add(new OpeningStockImportError(
                "medicine_name",
                $"{matches.Count} medicines are called \"{described}\" — use the barcode to say which one."));
            return null;
        }

        return matches[0];
    }

    private static string FormatExpiry(DateOnly expiry) =>
        expiry == MedicineBatch.NoExpiryDate ? "none" : expiry.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
