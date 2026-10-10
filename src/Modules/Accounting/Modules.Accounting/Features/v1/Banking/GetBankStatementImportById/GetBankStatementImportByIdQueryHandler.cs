using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.GetBankStatementImportById;

/// <summary>Reconciliation view for one imported statement: lines, ledger candidates, summary —
/// ported from <c>getBankReconciliation</c> in bank-reconciliation-service.ts.</summary>
public sealed class GetBankStatementImportByIdQueryHandler(AccountingDbContext dbContext)
    : IQueryHandler<GetBankStatementImportByIdQuery, BankStatementImportDto>
{
    public async ValueTask<BankStatementImportDto> Handle(GetBankStatementImportByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var import = await dbContext.BankStatementImports
            .AsNoTracking()
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == query.ImportId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Statement import {query.ImportId} not found.");

        var ledgerLines = await BankReconciliationLedgerQuery
            .GetAsync(dbContext, import.AccountId, import.PeriodStartUtc, import.PeriodEndUtc, import.BranchId, cancellationToken)
            .ConfigureAwait(false);

        var claimed = await BankReconciliationLedgerQuery
            .GetClaimedVoucherLineIdsAsync(dbContext, ledgerLines.Select(l => l.VoucherLineId).ToList(), cancellationToken)
            .ConfigureAwait(false);

        var (candidates, summary) = BankReconciliationSummaryCalculator.Build(import.Lines, ledgerLines, claimed);

        var lineDtos = import.Lines
            .OrderBy(l => l.LineNo)
            .Select(l => new BankStatementLineDto(
                l.Id, l.LineNo, l.TxnDateUtc, l.Description, l.Reference, l.DebitAmount, l.CreditAmount,
                l.Status.ToString(), l.MatchedVoucherLineId, l.MatchedAtUtc, l.MatchedBy, l.Note))
            .ToList();

        var ledgerDtos = candidates
            .Select(c => new LedgerCandidateDto(
                c.Ledger.VoucherLineId, c.Ledger.VoucherId, c.Ledger.VoucherNo, c.Ledger.VoucherDateUtc,
                c.Ledger.Description, c.Ledger.DebitAmount, c.Ledger.CreditAmount, c.Matched))
            .ToList();

        var summaryDto = new BankReconciliationSummaryDto(
            summary.StatementDebits, summary.StatementCredits, summary.StatementNet,
            summary.LedgerDebits, summary.LedgerCredits, summary.LedgerNet,
            summary.Difference, summary.UnmatchedStatementLines, summary.UnmatchedLedgerLines);

        return new BankStatementImportDto(
            import.Id, import.AccountId, import.StatementLabel, import.PeriodStartUtc, import.PeriodEndUtc,
            import.OpeningBalance, import.ClosingBalance, import.Status.ToString(), import.CreatedBy, import.CreatedAtUtc,
            import.ReconciledBy, import.ReconciledAtUtc, lineDtos, ledgerDtos, summaryDto, import.BranchId);
    }
}
