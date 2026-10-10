using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetCurrentCashShift;

public sealed class GetCurrentCashShiftQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetCurrentCashShiftQuery, CashShiftDto>
{
    public async ValueTask<CashShiftDto> Handle(GetCurrentCashShiftQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // The current shift is the one open at the caller's current branch.
        var branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var s = await dbContext.CashShifts
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Status == CashShiftStatus.Open && x.BranchId == branchId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("No cash shift is currently open at this branch.");

        return new CashShiftDto(
            s.Id, s.OpenedAtUtc, s.OpenedBy, s.OpeningFloat, s.ClosedAtUtc, s.ClosedBy,
            s.ClosingCashCounted, s.Status.ToString(), s.Notes, s.ClosingNotes, s.BranchId);
    }
}
