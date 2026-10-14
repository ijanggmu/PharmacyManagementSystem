using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Reference.Contracts.Controls;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Vouchers;

/// <summary>
/// The segregation-of-duties control on manual vouchers (<see cref="InternalControlSettings.VoucherCreatorCannotPostKey"/>,
/// off by default). When on, the user who drafted a manual voucher can't post it, and — once someone else has posted
/// it — can't void or reverse it either: otherwise the drafter could undo the reviewed entry on their own.
/// </summary>
internal static class VoucherSegregationOfDuties
{
    public static async ValueTask<bool> IsOnAsync(IMediator mediator, CancellationToken cancellationToken)
    {
        var stored = await mediator.Send(new GetTenantSettingsQuery(InternalControlSettings.Category), cancellationToken).ConfigureAwait(false);
        return InternalControlSettings.From(stored).VoucherCreatorCannotPost;
    }

    /// <summary>Refuses (403) a void or reversal of a manual voucher by the user who drafted it, while the control is
    /// on. System vouchers and vouchers saved before the creator was recorded are not blocked.</summary>
    public static async ValueTask EnsureNotDrafterAsync(
        AccountingDbContext dbContext, IMediator mediator, ICurrentUser currentUser, Guid voucherId, string action,
        CancellationToken cancellationToken)
    {
        var voucher = await dbContext.Vouchers
            .AsNoTracking()
            .Where(v => v.Id == voucherId)
            .Select(v => new { v.Source, v.CreatedBy })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (voucher is not { Source: AccountingVoucherSource.Manual, CreatedBy: not null })
        {
            return;
        }

        if (!string.Equals(voucher.CreatedBy, currentUser.GetUserId().ToString(), StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (await IsOnAsync(mediator, cancellationToken).ConfigureAwait(false))
        {
            throw new ForbiddenException(
                $"Segregation of duties is on: you drafted this voucher, so someone else with permission to {action} vouchers has to {action} it.");
        }
    }
}
