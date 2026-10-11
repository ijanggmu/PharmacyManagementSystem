using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetVatReturn;

public sealed class GetVatReturnQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetVatReturnQuery, VatReturnReportDto>
{
    public async ValueTask<VatReturnReportDto> Handle(GetVatReturnQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same branch rule as the trial balance. Users who may see every branch can pick one or all of
        // them, and everyone else is pinned to their own branch.
        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var accountIds = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == AccountingSystemAccountCodes.VatPayable || a.Code == AccountingSystemAccountCodes.InputVatRecoverable)
            .Select(a => new { a.Id, a.Code })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        Guid? outputId = accountIds.FirstOrDefault(a => a.Code == AccountingSystemAccountCodes.VatPayable)?.Id;
        Guid? inputId = accountIds.FirstOrDefault(a => a.Code == AccountingSystemAccountCodes.InputVatRecoverable)?.Id;
        var ids = accountIds.Select(a => a.Id).ToList();

        var totals = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where ids.Contains(line.AccountId)
                && voucher.VoucherDateUtc >= query.FromUtc
                && voucher.VoucherDateUtc <= query.ToUtc
                && (branchFilter == null || voucher.BranchId == branchFilter)
            group line by line.AccountId into g
            select new { AccountId = g.Key, Debit = g.Sum(l => l.DebitAmount), Credit = g.Sum(l => l.CreditAmount) })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var output = totals.FirstOrDefault(t => t.AccountId == outputId);
        var input = totals.FirstOrDefault(t => t.AccountId == inputId);

        decimal collected = output?.Credit ?? 0m;
        decimal refundedOrAdjusted = output?.Debit ?? 0m;
        decimal netOutput = collected - refundedOrAdjusted;
        decimal inputVat = (input?.Debit ?? 0m) - (input?.Credit ?? 0m);

        return new VatReturnReportDto(
            query.FromUtc, query.ToUtc, collected, refundedOrAdjusted, netOutput,
            InputVat: inputVat, NetVatDue: netOutput - inputVat, BranchId: branchFilter);
    }
}
