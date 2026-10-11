using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerAllergies;

public sealed class GetCustomerAllergiesQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCustomerAllergiesQuery, CustomerAllergiesDto>
{
    public async ValueTask<CustomerAllergiesDto> Handle(GetCustomerAllergiesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var allergies = await dbContext.Customers
            .AsNoTracking()
            .Where(c => c.Id == query.CustomerId)
            .Select(c => c.Allergies)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return new CustomerAllergiesDto(query.CustomerId, allergies ?? []);
    }
}
