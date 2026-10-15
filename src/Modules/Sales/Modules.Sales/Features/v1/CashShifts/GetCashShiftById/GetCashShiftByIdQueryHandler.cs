using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftById;

public sealed class GetCashShiftByIdQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetCashShiftByIdQuery, CashShiftDto>
{
    public async ValueTask<CashShiftDto> Handle(GetCashShiftByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var s = await dbContext.CashShifts
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == query.CashShiftId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Cash shift {query.CashShiftId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(s.BranchId, $"Cash shift {query.CashShiftId} not found.", cancellationToken).ConfigureAwait(false);

        return new CashShiftDto(
            s.Id, s.OpenedAtUtc, s.OpenedBy, s.OpeningFloat, s.ClosedAtUtc, s.ClosedBy,
            s.ClosingCashCounted, s.Status.ToString(), s.Notes, s.ClosingNotes, s.BranchId, s.ClosingExpectedCash);
    }
}
