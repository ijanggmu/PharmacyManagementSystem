using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Branch confinement for the single-voucher command handlers (post, update, delete, void, reverse): a
/// caller pinned to one branch may only act on that branch's vouchers. Answers 404 rather than 403 so
/// other branches' voucher ids don't leak — the same rule GetVoucherById applies to reads.
/// </summary>
internal static class VoucherBranchGuard
{
    public static async Task EnsureCanActOnVoucherAsync(
        AccountingDbContext dbContext, ICurrentBranch currentBranch, Guid voucherId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(currentBranch);

        var voucher = await dbContext.Vouchers
            .AsNoTracking()
            .Where(v => v.Id == voucherId)
            .Select(v => new { v.BranchId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {voucherId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(voucher.BranchId, $"Voucher {voucherId} not found.", cancellationToken).ConfigureAwait(false);
    }
}
