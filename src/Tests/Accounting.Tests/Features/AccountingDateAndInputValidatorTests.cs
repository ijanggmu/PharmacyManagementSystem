using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Features.v1.Banking.CreateBankStatementImport;
using FSH.Modules.Accounting.Features.v1.Banking.ReconcileBankAccount;
using FSH.Modules.Accounting.Features.v1.Banking.RecordBankDeposit;
using FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;
using FSH.Modules.Accounting.Features.v1.Expenses.SearchExpenses;
using FSH.Modules.Accounting.Features.v1.FixedAssets.CreateFixedAsset;
using FSH.Modules.Accounting.Features.v1.Reports.GetCashMovement;
using FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLoss;
using FSH.Modules.Accounting.Features.v1.Vouchers.ReverseVoucher;

namespace Accounting.Tests.Features;

/// <summary>
/// Input rules on the money-moving commands and the period reports: business dates are required and never after
/// today (Nepal time), payment methods must be known, a statement must add up, and a report's period can't run
/// backwards.
/// </summary>
public sealed class AccountingDateAndInputValidatorTests
{
    private static readonly DateTime Today = DateTime.UtcNow;
    private static readonly DateTime NextWeek = DateTime.UtcNow.AddDays(7);

    #region Business dates

    [Fact]
    public void ReverseVoucher_Should_Refuse_A_Future_Reversal_Date()
    {
        var validator = new ReverseVoucherCommandValidator();

        validator.Validate(new ReverseVoucherCommand(Guid.NewGuid(), NextWeek)).IsValid.ShouldBeFalse();
        validator.Validate(new ReverseVoucherCommand(Guid.NewGuid(), Today)).IsValid.ShouldBeTrue();
        validator.Validate(new ReverseVoucherCommand(Guid.NewGuid())).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void RecordExpense_Should_Refuse_A_Future_Or_Missing_Date()
    {
        var validator = new RecordExpenseCommandValidator();
        var expense = new RecordExpenseCommand(Today, "Rent", 1_000m, "cash");

        validator.Validate(expense).IsValid.ShouldBeTrue();
        validator.Validate(expense with { ExpenseDateUtc = NextWeek }).IsValid.ShouldBeFalse();
        validator.Validate(expense with { ExpenseDateUtc = default }).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void BankDeposit_Should_Refuse_A_Future_Date()
    {
        var validator = new RecordBankDepositCommandValidator();

        validator.Validate(new RecordBankDepositCommand(Today, 500m)).IsValid.ShouldBeTrue();
        validator.Validate(new RecordBankDepositCommand(NextWeek, 500m)).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void CreateFixedAsset_Should_Refuse_An_Acquisition_In_The_Future()
    {
        var validator = new CreateFixedAssetCommandValidator();
        var asset = new CreateFixedAssetCommand(
            "Laptop", "Computers", Today, 100_000m, FixedAssetValues.Sources.CashBank, "straight_line", "B",
            UsefulLifeMonths: 36, PaymentMethod: "bank");

        validator.Validate(asset).IsValid.ShouldBeTrue();
        validator.Validate(asset with { AcquisitionDateUtc = NextWeek }).Errors
            .ShouldContain(e => e.PropertyName == nameof(CreateFixedAssetCommand.AcquisitionDateUtc));
    }

    [Fact]
    public void Reconcile_Should_Require_A_Past_Statement_Date_And_Allow_An_Overdrawn_Balance()
    {
        var validator = new ReconcileBankAccountCommandValidator();

        validator.Validate(new ReconcileBankAccountCommand(Today, -2_500m)).IsValid.ShouldBeTrue();
        validator.Validate(new ReconcileBankAccountCommand(NextWeek, 100m)).IsValid.ShouldBeFalse();
        validator.Validate(new ReconcileBankAccountCommand(default, 100m)).IsValid.ShouldBeFalse();
    }

    #endregion

    #region Payment methods

    [Theory]
    [InlineData("cash", true)]
    [InlineData("Bank", true)]
    [InlineData("esewa", true)]
    [InlineData("bitcoin", false)]
    public void RecordExpense_Should_Accept_Only_Known_Payment_Methods(string method, bool valid)
    {
        new RecordExpenseCommandValidator().Validate(new RecordExpenseCommand(Today, "Rent", 1_000m, method)).IsValid.ShouldBe(valid);
    }

    #endregion

    #region Bank statements

    private static CreateBankStatementImportCommand Statement(decimal? opening, decimal? closing, IReadOnlyList<BankStatementImportLineInput> lines) =>
        new(Guid.NewGuid(), "October", new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 31, 0, 0, 0, DateTimeKind.Utc),
            opening, closing, lines);

    [Fact]
    public void StatementImport_Should_Report_Missing_Lines_Instead_Of_Crashing()
    {
        var result = new CreateBankStatementImportCommandValidator().Validate(Statement(null, null, null!));

        result.IsValid.ShouldBeFalse();
        result.Errors.ShouldContain(e => e.ErrorMessage.Contains("At least one statement line"));
    }

    [Fact]
    public void StatementImport_Should_Require_Opening_Plus_Lines_To_Equal_Closing()
    {
        var validator = new CreateBankStatementImportCommandValidator();
        BankStatementImportLineInput[] lines =
        [
            new(new DateTime(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc), "Deposit", "R1", 1_000m, 0m),
            new(new DateTime(2026, 10, 3, 0, 0, 0, DateTimeKind.Utc), "Charges", "R2", 0m, 50m),
        ];

        validator.Validate(Statement(200m, 1_150m, lines)).IsValid.ShouldBeTrue();
        validator.Validate(Statement(-500m, 450m, lines)).IsValid.ShouldBeTrue("an overdrawn opening balance is fine");
        validator.Validate(Statement(200m, 1_100m, lines)).IsValid.ShouldBeFalse();
        validator.Validate(Statement(null, 1_100m, lines)).IsValid.ShouldBeTrue("nothing to check without both balances");
    }

    #endregion

    #region Report periods

    [Fact]
    public void Period_Reports_Should_Refuse_A_Period_That_Ends_Before_It_Starts()
    {
        var from = new DateTime(2026, 10, 14, 0, 0, 0, DateTimeKind.Utc);
        var to = from.AddDays(-3);

        new GetProfitAndLossQueryValidator().Validate(new GetProfitAndLossQuery(from, to)).IsValid.ShouldBeFalse();
        new GetCashMovementQueryValidator().Validate(new GetCashMovementQuery(from, to)).IsValid.ShouldBeFalse();
        new GetProfitAndLossQueryValidator().Validate(new GetProfitAndLossQuery(to, from)).IsValid.ShouldBeTrue();
        new SearchExpensesQueryValidator().Validate(new SearchExpensesQuery(DateFromUtc: from, DateToUtc: to, PageSize: 20))
            .IsValid.ShouldBeFalse();
    }

    #endregion
}
