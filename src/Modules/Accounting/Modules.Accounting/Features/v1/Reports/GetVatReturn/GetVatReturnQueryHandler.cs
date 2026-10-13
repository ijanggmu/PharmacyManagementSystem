using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Features.v1.Vat;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Sales.Contracts.v1.Ird;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetVatReturn;

/// <summary>
/// The VAT return in IRD's monthly layout.
/// <list type="bullet">
/// <item><b>VAT amounts</b> (output, adjustments, input, net) come from the ledger, leaving out VAT settlement
/// vouchers (see <see cref="VatSettlement"/>). Counting every debit to VAT Payable as a "refund/adjustment" made
/// paying last month's VAT look like this month's output VAT had shrunk.</item>
/// <item><b>Turnover</b> (taxable / exempt / export sales, taxable / exempt / import purchases, credit notes and
/// debit notes) comes from the IRD registers through Contracts queries (<see cref="GetSalesVatSummaryQuery"/>,
/// <see cref="GetPurchaseVatSummaryQuery"/>): taxable and exempt sales share one revenue account, so the ledger
/// can't split them.</item>
/// <item><b>Carry-forward</b> comes from the ledger VAT position before the period (<see cref="VatPosition"/>).</item>
/// <item><b>Reconciliation</b> compares the registers' VAT with the ledger's for the same period.</item>
/// </list>
/// </summary>
public sealed class GetVatReturnQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch, IMediator mediator)
    : IQueryHandler<GetVatReturnQuery, VatReturnReportDto>
{
    /// <summary>Register and ledger VAT differing by less than this (rounding) still reconcile.</summary>
    public const decimal ReconciliationTolerance = 0.01m;

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
        decimal netVatDue = netOutput - inputVat;

        // Informational: how much the settlements took off VAT Payable (payments debit it).
        var settledOutput = lines.Where(l => l.IsSettlement && l.AccountId == outputId).ToList();
        decimal vatSettled = settledOutput.Sum(l => l.DebitAmount) - settledOutput.Sum(l => l.CreditAmount);

        // VAT paid to IRD in the period, as its effect on the VAT position (see VatPosition): over the settlement
        // lines on both VAT accounts, debits − credits. A payment (Dr 2100) counts +, a refund received
        // (Cr 1150 or 2100) counts −, and a set-off journal (Dr 2100 / Cr 1150) nets to 0.
        var settlements = lines.Where(l => l.IsSettlement).ToList();
        decimal vatPaid = settlements.Sum(l => l.DebitAmount) - settlements.Sum(l => l.CreditAmount);

        var carryForward = await CarryForwardAsync(query.FromUtc, branchFilter, netVatDue, vatPaid, cancellationToken)
            .ConfigureAwait(false);

        var salesSummary = await mediator.Send(new GetSalesVatSummaryQuery(query.FromUtc, query.ToUtc, branchFilter), cancellationToken)
            .ConfigureAwait(false);
        var purchaseSummary = await mediator.Send(new GetPurchaseVatSummaryQuery(query.FromUtc, query.ToUtc, branchFilter), cancellationToken)
            .ConfigureAwait(false);

        decimal netTaxableSales = salesSummary.TaxableSales - salesSummary.ReturnsTaxable;
        decimal netExemptSales = salesSummary.ExemptSales - salesSummary.ReturnsExempt;
        var sales = new VatReturnSalesDto(
            salesSummary.TaxableSales,
            salesSummary.OutputVat,
            salesSummary.ExemptSales,
            salesSummary.ExportSales,
            salesSummary.UnclassifiedSales,
            salesSummary.ReturnsTaxable,
            salesSummary.ReturnsExempt,
            salesSummary.ReturnsVat,
            NetTaxableSales: netTaxableSales,
            NetExemptSales: netExemptSales,
            NetOutputVat: salesSummary.OutputVat - salesSummary.ReturnsVat,
            NetTotalSales: netTaxableSales + netExemptSales + salesSummary.ExportSales + salesSummary.UnclassifiedSales,
            InvoiceCount: salesSummary.InvoiceCount,
            CreditNoteCount: salesSummary.CreditNoteCount);

        // Expenses booked on a VAT bill (rent, utilities…) are taxable purchases too; they live in this module, not
        // in the Purchasing register. A deleted expense is removed (and its voucher reversed), so it drops out.
        var expenseBills = await dbContext.Expenses
            .AsNoTracking()
            .Where(e => e.VatAmount > 0
                && e.ExpenseDateUtc >= query.FromUtc
                && e.ExpenseDateUtc <= query.ToUtc
                && (branchFilter == null || e.BranchId == branchFilter))
            .Select(e => new { e.Amount, e.VatAmount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        // Fixed assets bought on a VAT bill (capital purchases) likewise: their input VAT is in the ledger, so the bill
        // belongs in the purchase figures. A deleted asset is removed (its voucher reversed), so it drops out.
        var assetBills = await dbContext.FixedAssets
            .AsNoTracking()
            .Where(a => a.VatAmount > 0
                && a.AcquisitionDateUtc >= query.FromUtc
                && a.AcquisitionDateUtc <= query.ToUtc
                && (branchFilter == null || a.BranchId == branchFilter))
            .Select(a => new { a.Cost, a.VatAmount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        decimal expenseTaxable = expenseBills.Sum(e => e.Amount - e.VatAmount) + assetBills.Sum(a => a.Cost);
        decimal expenseVat = expenseBills.Sum(e => e.VatAmount) + assetBills.Sum(a => a.VatAmount);

        decimal taxablePurchases = purchaseSummary.TaxablePurchases + expenseTaxable;
        decimal purchaseInputVat = purchaseSummary.InputVat + expenseVat;
        decimal netTaxablePurchases = taxablePurchases - purchaseSummary.DebitNotesTaxable;
        decimal netExemptPurchases = purchaseSummary.ExemptPurchases - purchaseSummary.DebitNotesExempt;
        var purchases = new VatReturnPurchasesDto(
            taxablePurchases,
            purchaseInputVat,
            purchaseSummary.ExemptPurchases,
            purchaseSummary.ImportPurchases,
            purchaseSummary.ImportVat,
            purchaseSummary.DebitNotesTaxable,
            purchaseSummary.DebitNotesExempt,
            purchaseSummary.DebitNotesVat,
            NetTaxablePurchases: netTaxablePurchases,
            NetExemptPurchases: netExemptPurchases,
            NetInputVat: purchaseInputVat + purchaseSummary.ImportVat - purchaseSummary.DebitNotesVat,
            NetTotalPurchases: netTaxablePurchases + netExemptPurchases + purchaseSummary.ImportPurchases,
            BillCount: purchaseSummary.BillCount + expenseBills.Count + assetBills.Count,
            DebitNoteCount: purchaseSummary.DebitNoteCount);

        decimal outputDifference = sales.NetOutputVat - netOutput;
        decimal inputDifference = purchases.NetInputVat - inputVat;
        var reconciliation = new VatReturnReconciliationDto(
            RegisterOutputVat: sales.NetOutputVat,
            LedgerOutputVat: netOutput,
            OutputVatDifference: outputDifference,
            RegisterInputVat: purchases.NetInputVat,
            LedgerInputVat: inputVat,
            InputVatDifference: inputDifference,
            HasDifference: Math.Abs(outputDifference) >= ReconciliationTolerance
                || Math.Abs(inputDifference) >= ReconciliationTolerance);

        return new VatReturnReportDto(
            query.FromUtc, query.ToUtc, collected, refundedOrAdjusted, netOutput,
            InputVat: inputVat, NetVatDue: netVatDue, BranchId: branchFilter, VatSettled: vatSettled,
            Sales: sales, Purchases: purchases, CarryForward: carryForward, Reconciliation: reconciliation);
    }

    /// <summary>
    /// Carry-forward from earlier periods. The opening position is the ledger VAT position as of the period start
    /// (<see cref="VatPosition.AsOfAsync"/>: VAT Payable's credit balance less Input VAT's debit balance over every
    /// voucher before the period, so every earlier payment to and refund from IRD is already netted in). A negative
    /// opening position is excess input VAT from earlier returns — the credit brought forward — and is set against
    /// this period's net VAT; whatever it doesn't absorb is carried forward again. A positive opening position is VAT
    /// from earlier returns not yet paid: shown, but not part of this return's computation.
    /// </summary>
    private async Task<VatReturnCarryForwardDto> CarryForwardAsync(
        DateTime fromUtc, Guid? branchFilter, decimal netVatDue, decimal vatPaid, CancellationToken cancellationToken)
    {
        decimal opening = await VatPosition.AsOfAsync(dbContext, fromUtc, branchFilter, cancellationToken).ConfigureAwait(false);
        decimal creditBroughtForward = Math.Max(0m, -opening);
        return new VatReturnCarryForwardDto(
            OpeningPosition: opening,
            CreditBroughtForward: creditBroughtForward,
            UnpaidVatBroughtForward: Math.Max(0m, opening),
            NetVatForPeriod: netVatDue,
            VatPayable: Math.Max(0m, netVatDue - creditBroughtForward),
            CreditCarriedForward: Math.Max(0m, creditBroughtForward - netVatDue),
            VatPaidInPeriod: vatPaid,
            ClosingPosition: opening + netVatDue - vatPaid);
    }
}
