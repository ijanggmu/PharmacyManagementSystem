using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Returns.GetSupplierDebitNotes;

/// <summary>In-process: debit notes in a period for Purchasing's IRD purchase register.</summary>
public sealed class GetSupplierDebitNotesQueryHandler(SuppliersDbContext dbContext)
    : IQueryHandler<GetSupplierDebitNotesQuery, IReadOnlyList<SupplierDebitNoteRegisterDto>>
{
    public async ValueTask<IReadOnlyList<SupplierDebitNoteRegisterDto>> Handle(
        GetSupplierDebitNotesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var returns = await dbContext.SupplierReturns.AsNoTracking()
            .Include(r => r.Items)
            .Where(r => r.ReturnDateUtc >= query.PeriodStartUtc && r.ReturnDateUtc <= query.PeriodEndUtc
                && (query.BranchId == null || r.BranchId == query.BranchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return returns
            .Select(r => new SupplierDebitNoteRegisterDto(
                r.Id, r.ReturnDateUtc, r.SupplierId, r.DocumentNumber, r.SupplierInvoiceNumber, r.TotalCost, r.VatAmount, r.BranchId))
            .ToList();
    }
}
