using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Shared;

/// <summary>
/// Cash only moves through a counted drawer: with <c>controls.require_open_shift</c> on, taking cash (a sale) or paying
/// it out (a cash return or refund, cancelling a sale that took cash) needs an open cash shift at the branch, or is
/// refused with 409 <c>errors: ["cash_shift_required"]</c> — the marker the POS reads to point the user at Cashier / Z-Out.
/// </summary>
internal static class CashDrawerGuard
{
    public const string CashShiftRequiredMarker = "cash_shift_required";

    public const string TakingCashMessage = "Open a cash shift before taking cash: go to Cashier / Z-Out and count the opening float.";

    public const string PayingCashMessage =
        "Open a cash shift before paying cash out of the drawer: go to Cashier / Z-Out and count the opening float, " +
        "or give the money back another way.";

    /// <summary>409 <see cref="CashShiftRequiredMarker"/> unless a cash shift is open at <paramref name="branchId"/>.</summary>
    public static async Task EnsureShiftOpenAsync(SalesDbContext dbContext, Guid branchId, string message, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        bool shiftOpen = await dbContext.CashShifts
            .AsNoTracking()
            .AnyAsync(s => s.Status == CashShiftStatus.Open && s.BranchId == branchId, cancellationToken)
            .ConfigureAwait(false);
        if (!shiftOpen)
        {
            throw new CustomException(message, [CashShiftRequiredMarker], HttpStatusCode.Conflict);
        }
    }

    /// <summary>The cash a payout takes out of the drawer needs an open shift (when the tenant requires one).</summary>
    public static Task EnsureCashPayoutAllowedAsync(
        SalesDbContext dbContext, bool requireOpenShift, Guid branchId, decimal cashOut, CancellationToken cancellationToken) =>
        requireOpenShift && cashOut > 0m
            ? EnsureShiftOpenAsync(dbContext, branchId, PayingCashMessage, cancellationToken)
            : Task.CompletedTask;
}
