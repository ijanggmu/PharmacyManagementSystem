using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Contracts.v1.Tds;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;
using FSH.Modules.Accounting.Features.v1.Expenses.UpdateExpense;
using FSH.Modules.Accounting.Features.v1.Reports.GetTdsReport;
using FSH.Modules.Accounting.Features.v1.Tds;
using FSH.Modules.Accounting.Features.v1.Tds.RecordTdsPayment;
using FSH.Modules.Accounting.Features.v1.Tds.UpdateTdsCategories;

namespace Accounting.Tests.Features.Tds;

public sealed class TdsValidatorTests
{
    private static readonly DateTime Day = new(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void RecordExpense_Should_Accept_Tds_Up_To_The_Amount_Excluding_Vat()
    {
        var validator = new RecordExpenseCommandValidator();
        validator.Validate(new RecordExpenseCommand(
            Day, "Audit", 1130m, "cash", ReceiptReference: "B", VatAmount: 130m, SupplierVatNumber: "6",
            TdsCategory: "service_vat", TdsAmount: 1000m)).IsValid.ShouldBeTrue();
        validator.Validate(new RecordExpenseCommand(
            Day, "Audit", 1130m, "cash", ReceiptReference: "B", VatAmount: 130m, SupplierVatNumber: "6",
            TdsCategory: "service_vat", TdsAmount: 1000.01m)).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void RecordExpense_Should_Need_A_Category_For_Tds_And_A_Sane_Rate()
    {
        var validator = new RecordExpenseCommandValidator();
        validator.Validate(new RecordExpenseCommand(Day, "x", 100m, "cash", TdsAmount: 10m)).IsValid.ShouldBeFalse();
        validator.Validate(new RecordExpenseCommand(Day, "x", 100m, "cash", TdsCategory: "rent", TdsRatePercent: 0m)).IsValid.ShouldBeFalse();
        validator.Validate(new RecordExpenseCommand(Day, "x", 100m, "cash", TdsCategory: "rent", TdsRatePercent: 101m)).IsValid.ShouldBeFalse();
        validator.Validate(new RecordExpenseCommand(Day, "x", 100m, "cash", TdsCategory: "rent", TdsAmount: -1m)).IsValid.ShouldBeFalse();
        validator.Validate(new RecordExpenseCommand(Day, "x", 100m, "cash", TdsCategory: "rent")).IsValid.ShouldBeTrue();
        validator.Validate(new RecordExpenseCommand(Day, "x", 100m, "cash")).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void UpdateExpense_Should_Apply_The_Same_Tds_Rules()
    {
        var validator = new UpdateExpenseCommandValidator();
        validator.Validate(new UpdateExpenseCommand(Guid.NewGuid(), "x", 100m, "cash", TdsAmount: 10m)).IsValid.ShouldBeFalse();
        validator.Validate(new UpdateExpenseCommand(Guid.NewGuid(), "x", 100m, "cash", TdsCategory: "rent", TdsAmount: 101m)).IsValid.ShouldBeFalse();
        validator.Validate(new UpdateExpenseCommand(Guid.NewGuid(), "x", 100m, "cash", TdsCategory: "rent", TdsAmount: 10m)).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void UpdateTdsCategories_Should_Refuse_Duplicates_Bad_Codes_And_Rates()
    {
        var validator = new UpdateTdsCategoriesCommandValidator();
        validator.Validate(new UpdateTdsCategoriesCommand([new TdsCategoryInput("rent", "Rent", 10m)])).IsValid.ShouldBeTrue();
        validator.Validate(new UpdateTdsCategoriesCommand([])).IsValid.ShouldBeFalse();
        validator.Validate(new UpdateTdsCategoriesCommand(
            [new TdsCategoryInput("rent", "Rent", 10m), new TdsCategoryInput("RENT", "Rent 2", 10m)])).IsValid.ShouldBeFalse();
        validator.Validate(new UpdateTdsCategoriesCommand([new TdsCategoryInput("re nt", "Rent", 10m)])).IsValid.ShouldBeFalse();
        validator.Validate(new UpdateTdsCategoriesCommand([new TdsCategoryInput("rent", "Rent", 0m)])).IsValid.ShouldBeFalse();
        validator.Validate(new UpdateTdsCategoriesCommand([new TdsCategoryInput("rent", "Rent", 100.5m)])).IsValid.ShouldBeFalse();
        validator.Validate(new UpdateTdsCategoriesCommand([new TdsCategoryInput("rent", "", 10m)])).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void RecordTdsPayment_And_Report_Validators()
    {
        var payment = new RecordTdsPaymentCommandValidator();
        payment.Validate(new RecordTdsPaymentCommand(Day, 100m, "bank")).IsValid.ShouldBeTrue();
        payment.Validate(new RecordTdsPaymentCommand(Day, 0m, "bank")).IsValid.ShouldBeFalse();
        payment.Validate(new RecordTdsPaymentCommand(Day, 1.234m, "bank")).IsValid.ShouldBeFalse();
        payment.Validate(new RecordTdsPaymentCommand(Day, 10m, "")).IsValid.ShouldBeFalse();

        var report = new GetTdsReportQueryValidator();
        report.Validate(new GetTdsReportQuery(Day, Day.AddDays(30))).IsValid.ShouldBeTrue();
        report.Validate(new GetTdsReportQuery(Day, Day.AddDays(-1))).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void TdsPayment_Should_Be_Numbered_In_The_Payment_Series()
    {
        VoucherSeries.ForVoucherType(TdsVouchers.PaymentVoucherType).ShouldBe(VoucherSeries.Payment);
    }

    [Fact]
    public void Withholding_Should_Round_To_The_Paisa()
    {
        TdsWithholding.Compute(1234.56m, 1.5m).ShouldBe(18.52m);
        TdsWithholding.Compute(1000m, 15m).ShouldBe(150m);
    }

    [Fact]
    public void Expense_Should_Refuse_Tds_Above_The_Amount_Excluding_Vat()
    {
        Should.Throw<ArgumentOutOfRangeException>(() => Expense.Create(
            Day, "x", 1130m, "cash", null, "u", vatAmount: 130m,
            tds: new TdsWithholding("rent", "Rent", 10m, 1000m, 1000.01m)));

        var expense = Expense.Create(Day, "x", 1130m, "cash", null, "u", vatAmount: 130m,
            tds: new TdsWithholding("rent", "Rent", 10m, 1000m, 100m));
        expense.PayableAmount.ShouldBe(1030m);
        expense.Tds!.TaxableAmount.ShouldBe(1000m);
    }
}
