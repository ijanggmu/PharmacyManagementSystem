using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Payroll.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Books a posted payroll run's accrual journal (JV), dated at the run's posting date on the run's branch:
/// <list type="bullet">
///   <item>Dr Salary Expense 5400 — gross salaries; Dr Employer SSF Expense 5410 — the employer's SSF share.</item>
///   <item>Cr Salaries Payable 2200 — net pay; Cr SSF Payable 2210 — employee + employer SSF; Cr Salary TDS Payable 2155
///   — social security tax + income tax; Cr CIT Payable 2220; Cr Other Payroll Deductions Payable 2230.</item>
/// </list>
/// Zero lines are left out. Balanced by construction (gross + employer SSF = net + SSF + TDS + CIT + other). Idempotent
/// via the posted-voucher unique index on (TenantId, ReferenceType, ReferenceId) with the run id. Accounts missing on a
/// tenant seeded before payroll existed are created on first use (<see cref="PayrollAccounts"/>).
/// </summary>
public sealed class PayrollRunPostedIntegrationEventHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService) : IIntegrationEventHandler<PayrollRunPostedIntegrationEvent>
{
    public async Task HandleAsync(PayrollRunPostedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var lines = new List<PostVoucherLine>();
        await AddAsync(lines, AccountingSystemAccountCodes.SalaryExpense, "Gross salaries", @event.TotalGross, debit: true, ct).ConfigureAwait(false);
        await AddAsync(lines, AccountingSystemAccountCodes.EmployerSsfExpense, "Employer SSF contribution", @event.TotalEmployerSsf, debit: true, ct).ConfigureAwait(false);
        await AddAsync(lines, AccountingSystemAccountCodes.SalariesPayable, "Net salaries payable", @event.TotalNet, debit: false, ct).ConfigureAwait(false);
        await AddAsync(lines, AccountingSystemAccountCodes.SsfPayable, "SSF payable (employee + employer)",
            @event.TotalEmployeeSsf + @event.TotalEmployerSsf, debit: false, ct).ConfigureAwait(false);
        await AddAsync(lines, AccountingSystemAccountCodes.SalaryTdsPayable, "Salary TDS withheld", @event.TotalTds, debit: false, ct).ConfigureAwait(false);
        await AddAsync(lines, AccountingSystemAccountCodes.CitPayable, "CIT withheld", @event.TotalCit, debit: false, ct).ConfigureAwait(false);
        await AddAsync(lines, AccountingSystemAccountCodes.PayrollDeductionsPayable, "Other salary deductions",
            @event.TotalOtherDeductions, debit: false, ct).ConfigureAwait(false);

        if (lines.Count == 0)
        {
            return;
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: PayrollVoucherTypes.Accrual,
                ReferenceType: PayrollVoucherTypes.AccrualReference,
                ReferenceId: @event.RunId,
                Narration: $"Payroll for {@event.PeriodLabel}",
                Lines: lines,
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.PostingDateUtc),
            ct).ConfigureAwait(false);
    }

    private async Task AddAsync(List<PostVoucherLine> lines, string code, string description, decimal amount, bool debit, CancellationToken ct)
    {
        decimal rounded = AccountingVoucher.RoundAmount(amount);
        if (rounded == 0m)
        {
            return;
        }

        Guid accountId = await PayrollAccounts.GetOrCreateAsync(dbContext, code, ct).ConfigureAwait(false);
        lines.Add(debit
            ? new PostVoucherLine(accountId, description, DebitAmount: rounded, CreditAmount: 0m)
            : new PostVoucherLine(accountId, description, DebitAmount: 0m, CreditAmount: rounded));
    }
}
