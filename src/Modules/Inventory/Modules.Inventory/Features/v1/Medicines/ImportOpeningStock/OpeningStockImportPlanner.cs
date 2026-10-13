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

/// <summary>What the import will do with one row: the medicine and canonical batch number it resolved to.</summary>
public sealed record OpeningStockPlanRow(
    OpeningStockImportRow Row,
    string Status,
    OpeningStockMedicine? Medicine,
    string? BatchNo,
    IReadOnlyList<OpeningStockImportError> Errors,
    IReadOnlyList<string> Warnings);

/// <summary>
/// Per-row field rules of an opening-stock import. Property names are the template's column keys.
/// </summary>
public sealed class OpeningStockImportRowValidator : AbstractValidator<OpeningStockImportRow>
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
    }
}

/// <summary>
/// Pure planning step of an opening-stock import: field rules, which medicine each row means, and whether its lot
/// is new, tops up an existing lot (same batch number at this branch — its expiry must match), or can't take owned
/// stock (a consigned lot). Nothing here touches the database.
/// </summary>
public static class OpeningStockImportPlanner
{
    public static IReadOnlyList<OpeningStockPlanRow> Plan(
        IReadOnlyList<OpeningStockImportRow> rows,
        IReadOnlyCollection<OpeningStockMedicine> medicines,
        IReadOnlyCollection<OpeningStockLot> lots,
        DateOnly today)
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
        var seenLots = new Dictionary<(Guid MedicineId, string BatchNo), (int RowNumber, DateOnly? Expiry)>();

        var plan = new List<OpeningStockPlanRow>(rows.Count);
        foreach (var row in rows)
        {
            var errors = validator.Validate(row).Errors
                .Select(f => new OpeningStockImportError(f.PropertyName, f.ErrorMessage))
                .ToList();
            var warnings = new List<string>();

            var medicine = Resolve(row, byId, byBarcode, byIdentity, errors);
            string? batchNo = string.IsNullOrWhiteSpace(row.BatchNo) ? null : MedicineBatch.NormalizeBatchNo(row.BatchNo);

            if (medicine is not null && batchNo is not null)
            {
                var key = (medicine.Id, batchNo);
                if (lotByKey.TryGetValue(key, out var lot))
                {
                    if (lot.IsConsigned)
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
                            "Adds to existing batch {0} (on hand {1:0.###}).", batchNo, lot.QuantityOnHand));
                    }
                }

                if (seenLots.TryGetValue(key, out var earlier))
                {
                    if (earlier.Expiry is { } a && row.ExpiryDate is { } b && a != b)
                    {
                        errors.Add(new OpeningStockImportError(
                            "expiry_date",
                            $"Row {earlier.RowNumber} has batch {batchNo} of this medicine with a different expiry."));
                    }
                }
                else
                {
                    seenLots[key] = (row.RowNumber, row.ExpiryDate);
                }
            }

            if (errors.Count == 0)
            {
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
                    warnings.Add("Cost price is 0 — this stock adds nothing to the inventory value in the books.");
                }
            }

            plan.Add(new OpeningStockPlanRow(
                row,
                errors.Count > 0 ? OpeningStockImportRowStatuses.Failed : OpeningStockImportRowStatuses.Received,
                medicine,
                batchNo,
                errors,
                warnings));
        }

        return plan;
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
        List<OpeningStockImportError> errors)
    {
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
                errors.Add(new OpeningStockImportError("barcode", $"No medicine has barcode {row.Barcode.Trim()}."));
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
