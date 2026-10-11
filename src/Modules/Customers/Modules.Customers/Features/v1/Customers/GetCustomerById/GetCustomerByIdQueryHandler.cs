using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerById;

public sealed class GetCustomerByIdQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCustomerByIdQuery, CustomerDto>
{
    public async ValueTask<CustomerDto> Handle(GetCustomerByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var c = await dbContext.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == query.CustomerId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {query.CustomerId} not found.");

        return c.ToDto();
    }
}
