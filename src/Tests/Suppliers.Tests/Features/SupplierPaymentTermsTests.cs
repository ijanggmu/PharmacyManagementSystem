using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetApAgingReport;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetPayablesDue;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierOpenBills;
using FSH.Modules.Suppliers.IntegrationEventHandlers;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>Payment terms: how a bill's due date is set, and how aging, open bills and payables-due read it.</summary>
public sealed class PaymentTermsTests
{
    private static readonly DateTime BillDate = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Due_Date_Is_The_Bill_Date_Plus_Credit_Days() =>
        PaymentTerms.DueDate(BillDate, 30).ShouldBe(BillDate.AddDays(30));

    [Fact]
    public void A_Due_Date_Set_On_The_Bill_Wins_Over_The_Terms() =>
        PaymentTerms.DueDate(BillDate, 30, BillDate.AddDays(10)).ShouldBe(BillDate.AddDays(10));

    [Fact]
    public void No_Terms_Means_No_Due_Date() =>
        PaymentTerms.DueDate(BillDate, null).ShouldBeNull();

    [Fact]
    public void An_Unspecified_Override_Is_Stored_As_Utc() =>
        PaymentTerms.DueDate(BillDate, null, new DateTime(2026, 9, 5, 0, 0, 0, DateTimeKind.Unspecified)).ShouldNotBeNull().Kind.ShouldBe(DateTimeKind.Utc);

    [Fact]
    public void A_Stored_Due_Date_Is_Kept_And_An_Undated_Bill_Uses_The_Current_Terms()
    {
        PaymentTerms.EffectiveDueDate(BillDate.AddDays(15), BillDate, currentCreditDays: 60).ShouldBe(BillDate.AddDays(15));
        PaymentTerms.EffectiveDueDate(null, BillDate, currentCreditDays: 60).ShouldBe(BillDate.AddDays(60));
        PaymentTerms.EffectiveDueDate(null, BillDate, currentCreditDays: null).ShouldBeNull();
    }

    [Theory]
    [InlineData(-3, DueBucket.NotYetDue)]
    [InlineData(0, DueBucket.NotYetDue)]
    [InlineData(1, DueBucket.Overdue1To30)]
    [InlineData(30, DueBucket.Overdue1To30)]
    [InlineData(31, DueBucket.Overdue31To60)]
    [InlineData(60, DueBucket.Overdue31To60)]
    [InlineData(61, DueBucket.Overdue61To90)]
    [InlineData(90, DueBucket.Overdue61To90)]
    [InlineData(91, DueBucket.OverdueOver90)]
    public void Buckets_Count_Whole_Days_Past_Due(int daysPastDue, DueBucket expected) =>
        PaymentTerms.BucketOf(BillDate, BillDate.AddDays(daysPastDue).AddHours(3)).ShouldBe(expected);

    [Fact]
    public void A_Bill_Without_A_Due_Date_Has_Its_Own_Bucket() =>
        PaymentTerms.BucketOf(null, BillDate).ShouldBe(DueBucket.NoDueDate);

    [Theory]
    [InlineData(2, 7, "overdue")]
    [InlineData(0, 7, "due_soon")]
    [InlineData(-7, 7, "due_soon")]
    [InlineData(-8, 7, "later")]
    public void Schedule_Status_Uses_The_Due_Soon_Window(int daysPastDue, int withinDays, string expected) =>
        PaymentTerms.ScheduleStatus(BillDate, BillDate.AddDays(daysPastDue), withinDays).ShouldBe(expected);

    [Fact]
    public void Credit_Days_Are_Bounded()
    {
        Should.Throw<ArgumentOutOfRangeException>(() => Supplier.Create("X", null, null, null, null, null, 0m, creditDays: -1));
        Should.Throw<ArgumentOutOfRangeException>(() => Supplier.Create("X", null, null, null, null, null, 0m, creditDays: 366));
        Supplier.Create("X", null, null, null, null, null, 0m, creditDays: 0).CreditDays.ShouldBe(0);
    }

    [Fact]
    public void A_Credit_Never_Carries_A_Due_Date() =>
        SupplierLedgerEntry.Create(Guid.NewGuid(), BillDate, SupplierLedgerEntryType.Payment, null, 0m, 50m, 0m,
            dueDateUtc: BillDate).DueDateUtc.ShouldBeNull();
}

public sealed class SupplierDueDatePostingTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly DateTime _day1 = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);

    public void Dispose() => _db.Dispose();

    private static ICurrentBranch Branch(Guid? resolved = null)
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(resolved);
        return branch;
    }

    private async Task<Supplier> SeedAsync(string name, int? creditDays)
    {
        var supplier = Supplier.Create(name, null, null, null, null, null, 0m, creditDays);
        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        return supplier;
    }

    private void Post(Supplier supplier, DateTime date, decimal debit, decimal credit, DateTime? dueDateUtc = null)
    {
        decimal running = supplier.ApplyLedgerEntry(debit, credit);
        _db.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
            supplier.Id, date, debit > 0 ? SupplierLedgerEntryType.Purchase : SupplierLedgerEntryType.Payment,
            null, debit, credit, running, dueDateUtc: dueDateUtc));
    }

    [Fact]
    public async Task Purchase_Order_Bill_Falls_Due_Credit_Days_After_The_Receipt()
    {
        var supplier = await SeedAsync("Himal Pharma", 45);
        var receivedOn = _day1.AddDays(3);

        await new PurchaseOrderReceivedIntegrationEventHandler(_db, Substitute.For<ICurrentBranch>()).HandleAsync(
            new PurchaseOrderReceivedIntegrationEvent(
                Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Purchasing", Guid.CreateVersion7(), supplier.Id,
                100m, _day1, ReceivedAtUtc: receivedOn));

        (await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync()).DueDateUtc.ShouldBe(receivedOn.AddDays(45));
    }

    [Fact]
    public async Task Direct_Receipt_Uses_The_Due_Date_Set_On_The_Bill()
    {
        var supplier = await SeedAsync("Himal Pharma", 45);
        var due = _day1.AddDays(7);

        await new DirectGoodsReceiptPostedIntegrationEventHandler(_db, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentBranch>())
            .HandleAsync(new DirectGoodsReceiptPostedIntegrationEvent(
                Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Purchasing", Guid.CreateVersion7(), supplier.Id, 500m, _day1,
                DueDateUtc: due));

        (await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync()).DueDateUtc.ShouldBe(due);
    }

    [Fact]
    public async Task Pay_Later_Expense_Without_Supplier_Terms_Has_No_Due_Date()
    {
        var supplier = await SeedAsync("Nepal Electricity", null);

        await new ExpenseBillRecordedIntegrationEventHandler(_db, Substitute.For<ICurrentBranch>()).HandleAsync(
            new ExpenseBillRecordedIntegrationEvent(
                Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Accounting", Guid.CreateVersion7(), supplier.Id, 2000m, _day1, "Utilities"));

        (await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync()).DueDateUtc.ShouldBeNull();
    }

    [Fact]
    public async Task Aging_Buckets_Open_Bills_By_Due_Date_Alongside_Bill_Age()
    {
        var withTerms = await SeedAsync("Terms Pharma", 30);
        var noTerms = await SeedAsync("Cash Traders", null);
        var asOf = _day1.AddDays(100);

        Post(withTerms, _day1, 100m, 0m, dueDateUtc: _day1.AddDays(30));             // 70 days past due
        Post(withTerms, _day1.AddDays(80), 200m, 0m, dueDateUtc: _day1.AddDays(110)); // not yet due
        Post(withTerms, _day1.AddDays(90), 50m, 0m);                                  // stored undated: current terms → due day 120
        Post(noTerms, _day1.AddDays(10), 300m, 0m);                                   // no terms anywhere
        await _db.SaveChangesAsync();

        var aging = await new GetApAgingReportQueryHandler(_db, Branch())
            .Handle(new GetApAgingReportQuery(asOf), CancellationToken.None);

        var terms = aging.Single(l => l.SupplierId == withTerms.Id);
        terms.Overdue61To90.ShouldBe(100m);
        terms.NotYetDue.ShouldBe(250m);
        terms.NoDueDate.ShouldBe(0m);
        (terms.NotYetDue + terms.Overdue1To30 + terms.Overdue31To60 + terms.Overdue61To90 + terms.OverdueOver90 + terms.NoDueDate)
            .ShouldBe(terms.Total);
        terms.Over90.ShouldBe(100m); // the bill-date view is unchanged

        aging.Single(l => l.SupplierId == noTerms.Id).NoDueDate.ShouldBe(300m);
    }

    [Fact]
    public async Task Open_Bills_Show_Due_Date_And_Days_Overdue()
    {
        var supplier = await SeedAsync("Terms Pharma", 30);
        DateTime billDate = DateTime.UtcNow.AddDays(-40);
        Post(supplier, billDate, 100m, 0m, dueDateUtc: billDate.AddDays(30));
        await _db.SaveChangesAsync();

        var bills = await new GetSupplierOpenBillsQueryHandler(_db, Branch())
            .Handle(new GetSupplierOpenBillsQuery(supplier.Id), CancellationToken.None);

        var bill = bills.Bills.ShouldHaveSingleItem();
        bill.DueDateUtc.ShouldBe(billDate.AddDays(30));
        bill.DaysOverdue.ShouldBe(10);
    }

    [Fact]
    public async Task Payables_Due_Lists_Overdue_And_This_Weeks_Bills_With_Supplier_Totals()
    {
        var a = await SeedAsync("Alpha", 30);
        var b = await SeedAsync("Beta", null);
        var asOf = _day1.AddDays(40);

        Post(a, _day1, 100m, 0m, dueDateUtc: _day1.AddDays(30));             // 10 days overdue
        Post(a, _day1.AddDays(5), 60m, 0m, dueDateUtc: _day1.AddDays(44));   // due in 4 days
        Post(a, _day1.AddDays(30), 80m, 0m, dueDateUtc: _day1.AddDays(60));  // due later
        Post(a, asOf, 0m, 30m);                                               // pays 30 off the oldest bill
        Post(b, _day1, 500m, 0m);                                             // undated
        await _db.SaveChangesAsync();

        var due = await new GetPayablesDueQueryHandler(_db, Branch())
            .Handle(new GetPayablesDueQuery(asOf, WithinDays: 7), CancellationToken.None);

        due.TotalOverdue.ShouldBe(70m);
        due.TotalDueSoon.ShouldBe(60m);
        due.TotalLater.ShouldBe(80m);
        due.TotalNoDueDate.ShouldBe(500m);
        var alpha = due.Suppliers.ShouldHaveSingleItem();
        alpha.SupplierId.ShouldBe(a.Id);
        alpha.OverdueBillCount.ShouldBe(1);
        alpha.DueSoonBillCount.ShouldBe(1);
        due.Bills.Select(x => x.Status).ShouldBe(["overdue", "due_soon"]);
        due.Bills[0].DaysOverdue.ShouldBe(10);

        var all = await new GetPayablesDueQueryHandler(_db, Branch())
            .Handle(new GetPayablesDueQuery(asOf, IncludeAll: true), CancellationToken.None);
        all.Bills.Count.ShouldBe(4);
        all.Bills.Single(x => x.SupplierId == b.Id).Status.ShouldBe("no_due_date");
        all.Bills.Single(x => x.SupplierId == b.Id).AgeDays.ShouldBe(40);
    }
}
