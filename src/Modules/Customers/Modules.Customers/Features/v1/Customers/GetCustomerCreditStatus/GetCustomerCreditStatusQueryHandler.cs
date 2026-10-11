using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerCreditStatus;

/// <summary>
/// In-process read for Sales' credit-limit check; no endpoint. A sale may only be recorded against a live,
/// active customer, so this throws — and the sale is refused — instead of returning null (which the caller
/// used to read as "no credit limit"):
/// <list type="bullet">
/// <item>unknown or trashed customer → 404 <see cref="NotFoundException"/>;</item>
/// <item>inactive customer → 409.</item>
/// </list>
/// </summary>
public sealed class GetCustomerCreditStatusQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCustomerCreditStatusQuery, CustomerCreditStatusDto?>
{
    public async ValueTask<CustomerCreditStatusDto?> Handle(GetCustomerCreditStatusQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var row = await dbContext.Customers
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(c => c.Id == query.CustomerId)
            .Select(c => new { c.Id, c.Name, c.CurrentBalance, c.CreditLimit, c.IsActive, c.IsDeleted })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        if (row is null || row.IsDeleted)
        {
            throw new NotFoundException(
                row is null
                    ? $"Customer {query.CustomerId} not found."
                    : $"Customer {row.Name} has been deleted. Restore them before selling to them.");
        }

        if (!row.IsActive)
        {
            throw new CustomException(
                $"Customer {row.Name} is inactive. Reactivate them before selling to them.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Conflict);
        }

        return new CustomerCreditStatusDto(row.Id, row.Name, row.CurrentBalance, row.CreditLimit, row.IsActive);
    }
}
