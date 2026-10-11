using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerCreditStatus;

/// <summary>In-process read for Sales' credit-limit check; no endpoint.</summary>
public sealed class GetCustomerCreditStatusQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCustomerCreditStatusQuery, CustomerCreditStatusDto?>
{
    public async ValueTask<CustomerCreditStatusDto?> Handle(GetCustomerCreditStatusQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        return await dbContext.Customers
            .AsNoTracking()
            .Where(c => c.Id == query.CustomerId)
            .Select(c => new CustomerCreditStatusDto(c.Id, c.Name, c.CurrentBalance, c.CreditLimit))
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}
