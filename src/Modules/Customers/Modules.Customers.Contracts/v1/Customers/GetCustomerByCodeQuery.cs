using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

/// <summary>
/// Finds a live customer by the number on their card (case- and space-insensitive), as typed at
/// the counter or scanned from the card's QR. 404 when no live customer has it.
/// </summary>
public sealed record GetCustomerByCodeQuery(string Code) : IQuery<CustomerDto>;

/// <summary>Balance and limit for the credit-limit check on a sale. Null when the customer doesn't exist.</summary>
public sealed record GetCustomerCreditStatusQuery(Guid CustomerId) : IQuery<CustomerCreditStatusDto?>;
