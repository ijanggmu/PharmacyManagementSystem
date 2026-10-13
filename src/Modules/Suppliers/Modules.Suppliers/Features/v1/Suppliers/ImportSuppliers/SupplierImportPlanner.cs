using FSH.Modules.Suppliers.Contracts.v1.Suppliers;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.ImportSuppliers;

/// <summary>An existing supplier as the import matches against it.</summary>
public sealed record ExistingSupplierKey(Guid Id, string Name, string? TaxId);

/// <summary>What the import will do with one row.</summary>
public sealed record SupplierImportPlanRow(
    SupplierImportRow Row,
    string Status,
    ExistingSupplierKey? Match,
    IReadOnlyList<SupplierImportError> Errors,
    IReadOnlyList<string> Warnings);

/// <summary>
/// Pure planning step of a supplier import: field validation, duplicates inside the file, and matching against
/// existing suppliers by PAN / VAT number first, then by name (names are unique per tenant) — resolved into
/// created / updated / skipped / failed per row. Nothing here touches the database.
/// </summary>
public static class SupplierImportPlanner
{
    public static IReadOnlyList<SupplierImportPlanRow> Plan(
        IReadOnlyList<SupplierImportRow> rows,
        IReadOnlyCollection<ExistingSupplierKey> existing,
        string duplicateMode,
        DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(rows);
        ArgumentNullException.ThrowIfNull(existing);
        var rowValidator = new SupplierImportRowValidator(today);

        bool update = string.Equals(duplicateMode, SupplierImportDuplicateModes.Update, StringComparison.OrdinalIgnoreCase);

        var byPan = new Dictionary<string, ExistingSupplierKey>(StringComparer.Ordinal);
        var byName = new Dictionary<string, ExistingSupplierKey>(StringComparer.Ordinal);
        foreach (var supplier in existing)
        {
            if (SupplierImportKeys.PanKey(supplier.TaxId) is { } pan)
            {
                byPan.TryAdd(pan, supplier);
            }

            if (SupplierImportKeys.NameKey(supplier.Name) is { } name)
            {
                byName.TryAdd(name, supplier);
            }
        }

        var panInFile = new Dictionary<string, int>(StringComparer.Ordinal);
        var nameInFile = new Dictionary<string, int>(StringComparer.Ordinal);
        var matchedInFile = new Dictionary<Guid, int>();

        var plan = new List<SupplierImportPlanRow>(rows.Count);
        foreach (var row in rows)
        {
            var errors = rowValidator.Validate(row).Errors
                .Select(f => new SupplierImportError(f.PropertyName, f.ErrorMessage))
                .ToList();
            var warnings = new List<string>();

            string? panKey = SupplierImportKeys.IsValidPan(row.PanNumber) ? SupplierImportKeys.PanKey(row.PanNumber) : null;
            string? nameKey = SupplierImportKeys.NameKey(row.Name);

            if (nameKey is not null && !nameInFile.TryAdd(nameKey, row.RowNumber))
            {
                errors.Add(new SupplierImportError("name", $"Same name as row {nameInFile[nameKey]} — each supplier once per file."));
            }

            if (panKey is not null && !panInFile.TryAdd(panKey, row.RowNumber))
            {
                errors.Add(new SupplierImportError("pan", $"Same PAN as row {panInFile[panKey]} — each supplier once per file."));
            }

            ExistingSupplierKey? panMatch = panKey is not null ? byPan.GetValueOrDefault(panKey) : null;
            ExistingSupplierKey? nameMatch = nameKey is not null ? byName.GetValueOrDefault(nameKey) : null;
            ExistingSupplierKey? match = panMatch ?? nameMatch;
            if (panMatch is not null && nameMatch is not null && panMatch.Id != nameMatch.Id)
            {
                errors.Add(new SupplierImportError(
                    "pan",
                    $"The PAN belongs to \"{panMatch.Name}\" but another supplier is named \"{nameMatch.Name}\". Fix the name or the PAN."));
            }
            else if (match is not null && !matchedInFile.TryAdd(match.Id, row.RowNumber))
            {
                errors.Add(new SupplierImportError(
                    "name", $"Row {matchedInFile[match.Id]} already matches \"{match.Name}\" — each supplier once per file."));
            }

            string status;
            if (errors.Count > 0)
            {
                status = SupplierImportRowStatuses.Failed;
            }
            else if (match is null)
            {
                status = SupplierImportRowStatuses.Created;
            }
            else if (!update)
            {
                status = SupplierImportRowStatuses.Skipped;
                warnings.Add($"Already exists as \"{match.Name}\"; left unchanged.");
            }
            else
            {
                status = SupplierImportRowStatuses.Updated;
                if (nameKey is not null && !string.Equals(nameKey, SupplierImportKeys.NameKey(match.Name), StringComparison.Ordinal))
                {
                    warnings.Add($"Matched \"{match.Name}\" by PAN; the name is kept (rename it on the supplier's page).");
                }

                if (row.OpeningBalance is { } balance && balance != 0m)
                {
                    warnings.Add(
                        $"\"{match.Name}\" already exists, so the opening balance was not applied — record it on the supplier's ledger instead.");
                }
            }

            plan.Add(new SupplierImportPlanRow(row, status, match, errors, warnings));
        }

        return plan;
    }
}
