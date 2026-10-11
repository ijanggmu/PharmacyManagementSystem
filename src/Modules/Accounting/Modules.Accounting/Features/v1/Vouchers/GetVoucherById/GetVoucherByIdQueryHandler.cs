using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.GetVoucherById;

public sealed class GetVoucherByIdQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetVoucherByIdQuery, AccountingVoucherDto>
{
    public async ValueTask<AccountingVoucherDto> Handle(GetVoucherByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var voucher = await dbContext.Vouchers
            .AsNoTracking()
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == query.VoucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {query.VoucherId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(voucher.BranchId, $"Voucher {query.VoucherId} not found.", cancellationToken).ConfigureAwait(false);

        var accountIds = voucher.Lines.Select(l => l.AccountId).Distinct().ToList();
        var accounts = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => accountIds.Contains(a.Id))
            .Select(a => new { a.Id, a.Code, a.Name })
            .ToDictionaryAsync(a => a.Id, cancellationToken)
            .ConfigureAwait(false);

        var lines = voucher.Lines
            .OrderBy(l => l.LineNo)
            .Select(l => new AccountingVoucherLineDto(
                l.LineNo, l.AccountId,
                accounts.TryGetValue(l.AccountId, out var acc) ? acc.Code : null,
                accounts.TryGetValue(l.AccountId, out var acc2) ? acc2.Name : null,
                l.Description, l.DebitAmount, l.CreditAmount))
            .ToList();

        string? reversesVoucherNo = voucher.ReversesVoucherId is { } reversedId
            ? await dbContext.Vouchers.AsNoTracking()
                .Where(v => v.Id == reversedId)
                .Select(v => v.VoucherNo)
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false)
            : null;

        // The posted reversal wins when a reversal was itself voided and the voucher reversed again.
        var reversedBy = await dbContext.Vouchers.AsNoTracking()
            .Where(v => v.ReversesVoucherId == voucher.Id)
            .OrderBy(v => v.Status == AccountingVoucherStatus.Posted ? 0 : 1)
            .ThenByDescending(v => v.CreatedAtUtc)
            .Select(v => new { v.Id, v.VoucherNo })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return new AccountingVoucherDto(
            voucher.Id, voucher.VoucherNo, voucher.VoucherDateUtc, voucher.VoucherType, voucher.Source.ToString(),
            voucher.ReferenceType, voucher.ReferenceId, voucher.Status.ToString(), voucher.Narration,
            voucher.CreatedAtUtc, voucher.PostedAtUtc, voucher.PostedBy, voucher.VoidReason, lines, voucher.BranchId,
            lines.Sum(l => l.DebitAmount), lines.Sum(l => l.CreditAmount), lines.Count,
            voucher.ReversesVoucherId, reversesVoucherNo, reversedBy?.Id, reversedBy?.VoucherNo);
    }
}
