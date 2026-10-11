using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.ListTrashedCustomers;

public sealed class ListTrashedCustomersQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<ListTrashedCustomersQuery, PagedResponse<CustomerDto>>
{
    public async ValueTask<PagedResponse<CustomerDto>> Handle(
        ListTrashedCustomersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 20 : query.PageSize;

        var q = dbContext.Customers
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(c => c.IsDeleted)
            .OrderByDescending(c => c.DeletedOnUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q
            .Skip((page - 1) * size)
            .Take(size)
            .Select(c => new CustomerDto(
                c.Id, c.Name, c.Phone, c.Email, c.Address, c.CurrentBalance, c.IsActive,
                c.CreatedAtUtc, c.UpdatedAtUtc, c.DeletedOnUtc, c.DeletedBy))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<CustomerDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
