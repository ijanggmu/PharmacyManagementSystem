using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Features.v1.Vat;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetVatReturn;

/// <summary>
/// Output and input VAT for a period from the ledger, leaving out VAT settlement vouchers (see
/// <see cref="VatSettlement"/>). Counting every debit to VAT Payable as a "refund/adjustment" made paying
/// last month's VAT look like this month's output VAT had shrunk.
/// </summary>
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
            .Where(a => VatSettlement.VatAccountCodes.Contains(a.Code))
            .Select(a => new { a.Id, a.Code })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        Guid? outputId = accountIds.FirstOrDefault(a => a.Code == AccountingSystemAccountCodes.VatPayable)?.Id;
        Guid? inputId = accountIds.FirstOrDefault(a => a.Code == AccountingSystemAccountCodes.InputVatRecoverable)?.Id;
        var ids = accountIds.Select(a => a.Id).ToList();

        // Lines a settlement voucher may consist of: the VAT accounts and cash/bank.
        var settlementAccountIds = (await CashBankAccounts.IdsAsync(dbContext, cancellationToken).ConfigureAwait(false))
            .Concat(ids)
            .Distinct()
            .ToList();

        var lines = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where ids.Contains(line.AccountId)
                && voucher.VoucherDateUtc >= query.FromUtc
                && voucher.VoucherDateUtc <= query.ToUtc
                && (branchFilter == null || voucher.BranchId == branchFilter)
            select new
            {
                line.AccountId,
                line.DebitAmount,
                line.CreditAmount,
                IsSettlement = voucher.VoucherType == VatSettlement.VoucherType
                    || !dbContext.VoucherLines.Any(o => o.VoucherId == voucher.Id && !settlementAccountIds.Contains(o.AccountId)),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var activity = lines.Where(l => !l.IsSettlement).ToList();
        var output = activity.Where(l => l.AccountId == outputId).ToList();
        var input = activity.Where(l => l.AccountId == inputId).ToList();

        decimal collected = output.Sum(l => l.CreditAmount);
        decimal refundedOrAdjusted = output.Sum(l => l.DebitAmount);
        decimal netOutput = collected - refundedOrAdjusted;
        decimal inputVat = input.Sum(l => l.DebitAmount) - input.Sum(l => l.CreditAmount);

        // Informational: how much the settlements took off VAT Payable (payments debit it).
        var settledOutput = lines.Where(l => l.IsSettlement && l.AccountId == outputId).ToList();
        decimal vatSettled = settledOutput.Sum(l => l.DebitAmount) - settledOutput.Sum(l => l.CreditAmount);

        return new VatReturnReportDto(
            query.FromUtc, query.ToUtc, collected, refundedOrAdjusted, netOutput,
            InputVat: inputVat, NetVatDue: netOutput - inputVat, BranchId: branchFilter, VatSettled: vatSettled);
    }
}
