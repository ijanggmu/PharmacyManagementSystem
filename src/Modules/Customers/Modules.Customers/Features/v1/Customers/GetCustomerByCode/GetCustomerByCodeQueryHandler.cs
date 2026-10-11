using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerByCode;

public sealed class GetCustomerByCodeQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCustomerByCodeQuery, CustomerDto>
{
    public async ValueTask<CustomerDto> Handle(GetCustomerByCodeQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Codes are stored upper-case without spaces ("C-000123"); accept "c-000123" or " C-000123 ".
        string code = query.Code.Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant();

        var customer = await dbContext.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Code == code, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"No customer has the number {code}.");

        return customer.ToDto();
    }
}
