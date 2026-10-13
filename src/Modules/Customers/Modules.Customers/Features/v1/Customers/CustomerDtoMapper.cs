using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Domain;

namespace FSH.Modules.Customers.Features.v1.Customers;

internal static class CustomerDtoMapper
{
    public static CustomerDto ToDto(this Customer c) => new(
        c.Id, c.Name, c.Phone, c.Email, c.Address, c.CurrentBalance, c.IsActive,
        c.CreatedAtUtc, c.UpdatedAtUtc, c.DeletedOnUtc, c.DeletedBy,
        c.Code, c.CreditLimit, c.AvailableCredit, c.IsMember, c.LoyaltyPoints,
        c.Allergies, c.ChronicConditions, c.CurrentMedications, c.CreditDays, c.SmsConsent);
}
