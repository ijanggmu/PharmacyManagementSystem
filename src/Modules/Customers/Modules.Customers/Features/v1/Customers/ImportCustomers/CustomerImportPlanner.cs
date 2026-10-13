using FSH.Modules.Customers.Contracts.v1.Customers;

namespace FSH.Modules.Customers.Features.v1.Customers.ImportCustomers;

/// <summary>An existing customer as the import matches against it.</summary>
public sealed record ExistingCustomerKey(Guid Id, string Code, string Name, string? Phone, string? PanNumber);

/// <summary>What the import will do with one row.</summary>
public sealed record CustomerImportPlanRow(
    CustomerImportRow Row,
    string Status,
    ExistingCustomerKey? Match,
    IReadOnlyList<CustomerImportError> Errors,
    IReadOnlyList<string> Warnings);

/// <summary>
/// Pure planning step of a customer import: field validation, duplicates inside the file, and matching against
/// existing customers by phone or PAN — resolved into created / updated / skipped / failed per row. Nothing here
/// touches the database, so the dry run and the real run see exactly the same plan.
/// </summary>
public static class CustomerImportPlanner
{
    public static IReadOnlyList<CustomerImportPlanRow> Plan(
        IReadOnlyList<CustomerImportRow> rows,
        IReadOnlyCollection<ExistingCustomerKey> existing,
        string duplicateMode,
        DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(rows);
        ArgumentNullException.ThrowIfNull(existing);
        var rowValidator = new CustomerImportRowValidator(today);

        bool update = string.Equals(duplicateMode, CustomerImportDuplicateModes.Update, StringComparison.OrdinalIgnoreCase);

        var byPhone = new Dictionary<string, ExistingCustomerKey>(StringComparer.Ordinal);
        var byPan = new Dictionary<string, ExistingCustomerKey>(StringComparer.Ordinal);
        foreach (var customer in existing)
        {
            if (CustomerImportKeys.PhoneKey(customer.Phone) is { } phone)
            {
                byPhone.TryAdd(phone, customer);
            }

            if (CustomerImportKeys.PanKey(customer.PanNumber) is { } pan)
            {
                byPan.TryAdd(pan, customer);
            }
        }

        // First row of the file that used each phone / PAN: a later row repeating it is an error, not a second customer.
        var phoneInFile = new Dictionary<string, int>(StringComparer.Ordinal);
        var panInFile = new Dictionary<string, int>(StringComparer.Ordinal);
        var matchedInFile = new Dictionary<Guid, int>();

        var plan = new List<CustomerImportPlanRow>(rows.Count);
        foreach (var row in rows)
        {
            var errors = rowValidator.Validate(row).Errors
                .Select(f => new CustomerImportError(f.PropertyName, f.ErrorMessage))
                .ToList();
            var warnings = new List<string>();

            string? phoneKey = CustomerImportKeys.PhoneKey(row.Phone);
            string? panKey = CustomerImportKeys.IsValidPan(row.PanNumber) ? CustomerImportKeys.PanKey(row.PanNumber) : null;

            if (phoneKey is not null && !phoneInFile.TryAdd(phoneKey, row.RowNumber))
            {
                errors.Add(new CustomerImportError("phone", $"Same phone as row {phoneInFile[phoneKey]} — each customer once per file."));
            }

            if (panKey is not null && !panInFile.TryAdd(panKey, row.RowNumber))
            {
                errors.Add(new CustomerImportError("pan", $"Same PAN as row {panInFile[panKey]} — each customer once per file."));
            }

            ExistingCustomerKey? phoneMatch = phoneKey is not null ? byPhone.GetValueOrDefault(phoneKey) : null;
            ExistingCustomerKey? panMatch = panKey is not null ? byPan.GetValueOrDefault(panKey) : null;
            ExistingCustomerKey? match = phoneMatch ?? panMatch;
            if (phoneMatch is not null && panMatch is not null && phoneMatch.Id != panMatch.Id)
            {
                errors.Add(new CustomerImportError(
                    "pan",
                    $"The phone belongs to {Describe(phoneMatch)} but the PAN to {Describe(panMatch)}. Fix one of them."));
            }
            else if (match is not null && !matchedInFile.TryAdd(match.Id, row.RowNumber))
            {
                errors.Add(new CustomerImportError(
                    "phone", $"Row {matchedInFile[match.Id]} already matches {Describe(match)} — each customer once per file."));
            }

            string status;
            if (errors.Count > 0)
            {
                status = CustomerImportRowStatuses.Failed;
            }
            else if (match is null)
            {
                status = CustomerImportRowStatuses.Created;
            }
            else if (!update)
            {
                status = CustomerImportRowStatuses.Skipped;
                warnings.Add($"Already exists as {Describe(match)}; left unchanged.");
            }
            else
            {
                status = CustomerImportRowStatuses.Updated;
                if (row.OpeningBalance is { } balance && balance != 0m)
                {
                    warnings.Add(
                        $"{Describe(match)} already exists, so the opening balance was not applied — record it as a payment or adjustment on the customer's ledger instead.");
                }
            }

            plan.Add(new CustomerImportPlanRow(row, status, match, errors, warnings));
        }

        return plan;
    }

    private static string Describe(ExistingCustomerKey customer) => $"{customer.Name} ({customer.Code})";
}
