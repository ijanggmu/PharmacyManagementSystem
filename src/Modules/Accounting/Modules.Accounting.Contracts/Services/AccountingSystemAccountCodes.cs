namespace FSH.Modules.Accounting.Contracts.Services;

/// <summary>
/// Stable codes for the standard system chart of accounts seeded by
/// <c>AccountingDbInitializer</c> — other modules map their own postings onto these via
/// <see cref="IAccountingAccountResolver"/> instead of hardcoding magic strings.
/// </summary>
public static class AccountingSystemAccountCodes
{
    public const string Cash = "1000";
    public const string Bank = "1010";
    public const string AccountsReceivable = "1100";

    /// <summary>"Insurance Receivable" — the part of a sale an insurer pays later. Not a customer's account
    /// (it has no subledger), so it stays out of Accounts Receivable; the insurer's settlement is posted
    /// against it (Dr Bank / Cr Insurance Receivable). An odd code so it is unlikely to collide with a
    /// user-created account.</summary>
    public const string InsuranceReceivable = "1190";
    public const string Inventory = "1200";

    /// <summary>"Fixed Assets" — property, plant &amp; equipment at cost (furniture, computers, fridges, vehicles,
    /// buildings, software), fed only by the fixed asset register (acquire / dispose). A control account: the register
    /// lists exactly what makes up its balance. 1550 rather than 1500 because the account allocator hands out the
    /// hundreds (1300, 1400, 1500 …) to user-created asset accounts.</summary>
    public const string FixedAssets = "1550";

    /// <summary>"Accumulated Depreciation" — the contra-asset (credit balance, Asset type) beside
    /// <see cref="FixedAssets"/>: credited by each depreciation run and by an opening asset's depreciation to date,
    /// debited when an asset is disposed. Fixed Assets 1550 + this 1590 = net book value of the register.</summary>
    public const string AccumulatedDepreciation = "1590";
    public const string AccountsPayable = "2000";
    public const string VatPayable = "2100";

    /// <summary>"TDS Payable" — tax deducted at source (withholding tax) from payments to vendors, owed to IRD
    /// until it is deposited (Dr TDS Payable / Cr Bank). Between VAT Payable 2100 and the next hundred the
    /// account allocator hands out (2200), so it is unlikely to collide with a user-created account.</summary>
    public const string TdsPayable = "2150";

    /// <summary>"Cheques Issued" (PDC payable) — cheques given to suppliers that the bank has not paid yet. A supplier
    /// payment by cheque is posted here (Dr AP / Cr Cheques Issued) and moves out of the bank when the cheque clears
    /// (Dr Cheques Issued / Cr Bank). Next to TDS Payable 2150.</summary>
    public const string ChequesIssued = "2160";

    /// <summary>"Salary TDS Payable" — tax withheld from salaries (the 1% social security tax and the income tax), owed
    /// to IRD until deposited. Kept apart from vendor TDS Payable 2150 on purpose: salary tax is deposited and returned
    /// separately (its own e-TDS return / revenue head), and 2150's balance drives the vendor TDS deposit screen, which
    /// must not pick up salary tax. Between 2150 and 2160 so the account allocator never hands it out.</summary>
    public const string SalaryTdsPayable = "2155";

    /// <summary>"Salaries Payable" — net salaries owed to employees between posting a payroll run (Cr) and paying it (Dr).
    /// The payroll payables sit at 2810–2840, away from 2200, 2300 … which the account allocator hands to user-created
    /// liability accounts (loans etc.).</summary>
    public const string SalariesPayable = "2810";

    /// <summary>"SSF Payable" — Social Security Fund contributions (employee 11% + employer 20% of basic) owed to the SSF.</summary>
    public const string SsfPayable = "2820";

    /// <summary>"CIT Payable" — employees' Citizen Investment Trust contributions withheld from salaries, owed to the CIT.</summary>
    public const string CitPayable = "2830";

    /// <summary>"Other Payroll Deductions Payable" — any other amount withheld from salaries (advance recovery, …) until
    /// it is settled.</summary>
    public const string PayrollDeductionsPayable = "2840";

    /// <summary>"Doctor Fees Payable" — visiting doctors' share of the consultation fees the pharmacy collected, owed until
    /// the doctor is paid. Next to the payroll payables, away from the hundreds the allocator hands out.</summary>
    public const string DoctorFeesPayable = "2850";

    /// <summary>"Consultation Fee Income" — the pharmacy's part of visiting doctors' consultation fees (the fee less the
    /// doctor's share). Health services are VAT-exempt, so no VAT is split out. An odd code the allocator never hands
    /// out.</summary>
    public const string ConsultationFeeIncome = "4810";
    public const string InputVatRecoverable = "1150";

    /// <summary>"Cheques in Hand" (PDC receivable) — customer cheques received but not yet cleared. A customer receipt
    /// by cheque is posted here, not to the bank (Dr Cheques in Hand / Cr AR), and moves to the bank when the cheque
    /// clears (Dr Bank / Cr Cheques in Hand). Outside the 10xx cash &amp; bank block on purpose: it is not money in the
    /// bank yet. Next to Input VAT 1150, an odd code unlikely to collide with a user-created account.</summary>
    public const string ChequesInHand = "1160";
    public const string OwnersEquity = "3000";

    /// <summary>"Retained Earnings" — receives each closed fiscal year's profit or loss (see the year-end close).
    /// A high code in the Equity block, like <see cref="RoundingOff"/>, so it is unlikely to collide with a
    /// user-created account (those are numbered 3100, 3200, ...).</summary>
    public const string RetainedEarnings = "3900";
    public const string SalesRevenue = "4000";
    public const string SalesReturnsAndAllowances = "4100";

    /// <summary>"Gain on Disposal of Fixed Assets" — other income when an asset is sold for more than its net book
    /// value. Gains and losses get separate accounts (this one, and <see cref="LossOnAssetDisposal"/>) so the P&amp;L
    /// shows a gain as other income and a loss as an expense, never a negative revenue, and the cash-flow statement can
    /// take each out of operating profit as a non-cash item. An odd code the allocator never hands out.</summary>
    public const string GainOnAssetDisposal = "4950";
    public const string CostOfGoodsSold = "5000";

    /// <summary>"Stock Write-off &amp; Expiry Loss" — stock written off (expired, damaged) and count shortages, kept out
    /// of Cost of Goods Sold so the gross margin shows only what was sold; a count surplus is credited back to it.
    /// Not a multiple of ten, so the code allocator never hands it to a user-created expense account.</summary>
    public const string StockWriteOff = "5015";
    public const string GeneralExpenses = "5100";

    /// <summary>"Depreciation Expense" — the book depreciation of the fixed asset register, debited by each depreciation
    /// run (Cr <see cref="AccumulatedDepreciation"/>). A non-cash expense: the cash-flow statement adds it back.</summary>
    public const string DepreciationExpense = "5350";

    /// <summary>"Salary Expense" — gross salaries (basic, grade, allowances) of each posted payroll run. 5810/5820 keep the
    /// payroll expenses clear of codes the allocator hands to user-created expense accounts.</summary>
    public const string SalaryExpense = "5810";

    /// <summary>"Employer SSF Expense" — the employer's 20% Social Security Fund contribution on basic salary.</summary>
    public const string EmployerSsfExpense = "5820";

    /// <summary>"Loss on Disposal of Fixed Assets" — when an asset is sold for less than its net book value or written
    /// off. See <see cref="GainOnAssetDisposal"/>.</summary>
    public const string LossOnAssetDisposal = "5950";

    /// <summary>"Cash Short &amp; Over" — absorbs the drawer variance when a cash shift is closed with a
    /// count that differs from the expected cash (a shortage is an expense debit, an overage a credit). In
    /// the Expenses block next to Rounding Off, an odd high code unlikely to collide with a user account.</summary>
    public const string CashShortAndOver = "5980";

    /// <summary>"Rounding Off" — absorbs the sub-paisa residual left when a system voucher's lines are
    /// rounded to 2 decimal places (see <c>VoucherPostingService</c>). An odd, high code in the
    /// Expenses block so it is unlikely to collide with a user-created account.</summary>
    public const string RoundingOff = "5990";
}
