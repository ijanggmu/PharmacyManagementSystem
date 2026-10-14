using FSH.Modules.Customers.Features.v1.Customers.ImportCustomers;

namespace FSH.Modules.Customers.Features.v1.Customers;

/// <summary>Field rules shared by creating and updating a customer (the import applies the same PAN rule).</summary>
public static class CustomerProfileRules
{
    public const string PanMessage = "PAN / VAT number must be 9 digits.";

    public const string DateOfBirthMessage = "Enter a valid date of birth: not in the future and not more than 130 years ago.";

    /// <summary>A Nepal PAN / VAT number: 9 digits (spaces ignored).</summary>
    public static bool IsValidPan(string? pan) => CustomerImportKeys.IsValidPan(pan);

    public static bool IsPlausibleDateOfBirth(DateOnly dateOfBirth) => IsPlausibleDateOfBirth(dateOfBirth, CustomerImportKeys.NepalToday());

    public static bool IsPlausibleDateOfBirth(DateOnly dateOfBirth, DateOnly today) =>
        dateOfBirth <= today && dateOfBirth >= today.AddYears(-130);
}
