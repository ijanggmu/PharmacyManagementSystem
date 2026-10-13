using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.ListTrashedSuppliers;

public sealed class ListTrashedSuppliersQueryHandler(SuppliersDbContext dbContext)
    : IQueryHandler<ListTrashedSuppliersQuery, PagedResponse<SupplierDto>>
{
    public async ValueTask<PagedResponse<SupplierDto>> Handle(
        ListTrashedSuppliersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 20 : query.PageSize;

        var q = dbContext.Suppliers
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(s => s.IsDeleted)
            .OrderByDescending(s => s.DeletedOnUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q
            .Skip((page - 1) * size)
            .Take(size)
            .Select(s => new SupplierDto(
                s.Id, s.Name, s.ContactPerson, s.Phone, s.Email, s.Address, s.TaxId,
                s.CurrentBalance, s.IsActive, s.CreatedAtUtc, s.UpdatedAtUtc, s.DeletedOnUtc, s.DeletedBy, s.CreditDays))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<SupplierDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
