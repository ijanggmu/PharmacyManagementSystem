using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Loyalty;

/// <summary>The customer's loyalty account with its most recent movements.</summary>
public sealed record GetCustomerLoyaltyQuery(Guid CustomerId, int Take = 50) : IQuery<CustomerLoyaltyDto>;

/// <summary>Membership and points for Sales' redemption check; null when the customer doesn't exist.</summary>
public sealed record GetCustomerLoyaltyStatusQuery(Guid CustomerId) : IQuery<CustomerLoyaltyStatusDto?>;

/// <summary>Staff correction of a customer's points (positive adds, negative removes), with a reason.</summary>
public sealed record AdjustLoyaltyPointsCommand(Guid CustomerId, int Points, string Reason) : ICommand<int>;
