using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.GetSupplierById;

public sealed class GetSupplierByIdQueryHandler(SuppliersDbContext dbContext)
    : IQueryHandler<GetSupplierByIdQuery, SupplierDto>
{
    public async ValueTask<SupplierDto> Handle(GetSupplierByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var s = await dbContext.Suppliers
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == query.SupplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {query.SupplierId} not found.");

        return new SupplierDto(
            s.Id, s.Name, s.ContactPerson, s.Phone, s.Email, s.Address, s.TaxId,
            s.CurrentBalance, s.IsActive, s.CreatedAtUtc, s.UpdatedAtUtc, s.DeletedOnUtc, s.DeletedBy, s.CreditDays);
    }
}
