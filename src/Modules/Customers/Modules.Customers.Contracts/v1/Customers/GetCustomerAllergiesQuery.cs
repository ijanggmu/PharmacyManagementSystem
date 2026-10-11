using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

/// <summary>
/// Returns the customer's recorded allergies, or an empty list when the customer has none
/// recorded or does not exist (mirrors the legacy checkAllergies()'s maybeSingle lookup — a
/// missing customer is not itself a reason to fail a sale's safety check).
/// </summary>
public sealed record GetCustomerAllergiesQuery(Guid CustomerId) : IQuery<CustomerAllergiesDto>;
