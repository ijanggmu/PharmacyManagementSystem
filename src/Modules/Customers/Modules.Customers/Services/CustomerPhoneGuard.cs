using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Features.v1.Customers.ImportCustomers;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Services;

/// <summary>
/// A phone number identifies a customer at the counter (search, SMS, import matching), so two active customers
/// must not share one. Numbers are compared by their digits without the +977 country code
/// (<see cref="CustomerImportKeys.PhoneKey"/>, the rule the import matches on), so "+977-9841234567" and
/// "9841 234567" are the same number. Inactive and trashed customers are not counted.
/// </summary>
internal static class CustomerPhoneGuard
{
    /// <summary>409 when another active customer already has <paramref name="phone"/>.</summary>
    public static async Task EnsureAvailableAsync(
        CustomersDbContext dbContext, string? phone, Guid? excludeId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (CustomerImportKeys.PhoneKey(phone) is not { } key)
        {
            return;
        }

        // Phones are stored as typed (spaces, dashes, +977), so the digits are compared in memory. Only the
        // id, name and phone of active customers with a phone are read.
        var candidates = await dbContext.Customers.AsNoTracking()
            .Where(c => c.IsActive && c.Phone != null && (excludeId == null || c.Id != excludeId))
            .Select(c => new { c.Name, c.Code, c.Phone })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var taken = candidates.Find(c => string.Equals(CustomerImportKeys.PhoneKey(c.Phone), key, StringComparison.Ordinal));
        if (taken is not null)
        {
            throw new CustomException(
                $"Phone {phone!.Trim()} is already used by {taken.Name} ({taken.Code}). Use that customer, or enter a different number.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    /// <summary>Whether an update changes the phone number (by its digits).</summary>
    public static bool Changes(string? stored, string? requested) =>
        !string.Equals(CustomerImportKeys.PhoneKey(stored), CustomerImportKeys.PhoneKey(requested), StringComparison.Ordinal);
}
