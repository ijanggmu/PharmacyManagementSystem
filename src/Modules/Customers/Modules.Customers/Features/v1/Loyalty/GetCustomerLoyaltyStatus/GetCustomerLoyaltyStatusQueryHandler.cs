using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Loyalty.GetCustomerLoyaltyStatus;

/// <summary>In-process read for Sales' redemption check; no endpoint.</summary>
public sealed class GetCustomerLoyaltyStatusQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCustomerLoyaltyStatusQuery, CustomerLoyaltyStatusDto?>
{
    public async ValueTask<CustomerLoyaltyStatusDto?> Handle(GetCustomerLoyaltyStatusQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        return await dbContext.Customers.AsNoTracking()
            .Where(c => c.Id == query.CustomerId)
            .Select(c => new CustomerLoyaltyStatusDto(c.Id, c.IsMember, c.LoyaltyPoints))
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}
