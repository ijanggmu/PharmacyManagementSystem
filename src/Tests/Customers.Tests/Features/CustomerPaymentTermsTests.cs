using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Ledger.GetArAgingReport;
using FSH.Modules.Customers.Features.v1.Ledger.GetReceivablesDue;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Customers.Tests.Features;

/// <summary>Customer payment terms: credit sales get a due date; AR aging and receivables-due read it.</summary>
public sealed class CustomerPaymentTermsTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly DateTime _day1 = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);

    public CustomerPaymentTermsTests() =>
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));

    public void Dispose() => _db.Dispose();

    private async Task<Customer> SeedAsync(string name, int? creditDays)
    {
        var customer = Customer.Create(name, null, null, null, 0m, "C-" + name);
        customer.SetCreditDays(creditDays);
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        return customer;
    }

    private void Post(Customer customer, DateTime date, decimal debit, decimal credit, DateTime? dueDateUtc = null)
    {
        decimal running = customer.ApplyLedgerEntry(debit, credit);
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customer.Id, date, debit > 0 ? CustomerLedgerEntryType.Sale : CustomerLedgerEntryType.Payment,
            null, debit, credit, running, documentNumber: debit > 0 ? "INV-" + date.Day : null, dueDateUtc: dueDateUtc));
    }

    [Fact]
    public void Due_Date_Follows_The_Customers_Terms()
    {
        var customer = Customer.Create("Ram", null, null, null, 0m, "C-1");
        customer.DueDateFor(_day1).ShouldBeNull();
        customer.SetCreditDays(15);
        customer.DueDateFor(_day1).ShouldBe(_day1.AddDays(15));
        Should.Throw<ArgumentOutOfRangeException>(() => customer.SetCreditDays(400));
    }

    [Fact]
    public async Task A_Credit_Sale_Gets_A_Due_Date_From_The_Customers_Terms()
    {
        var customer = await SeedAsync("Ram", 30);

        await new CustomerSalePostingService(_db).PostSaleAsync(
            new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), Guid.CreateVersion7(), 250m, 0, false, "INV-9"));

        var entry = await _db.CustomerLedgerEntries.AsNoTracking().SingleAsync();
        entry.DueDateUtc.ShouldNotBeNull();
        (entry.DueDateUtc!.Value - entry.EntryDateUtc).ShouldBe(TimeSpan.FromDays(30));
    }

    [Fact]
    public async Task Aging_Buckets_Open_Debts_By_Due_Date_After_Fifo_Settlement()
    {
        var withTerms = await SeedAsync("Sita", 15);
        var noTerms = await SeedAsync("Hari", null);
        var asOf = _day1.AddDays(60);

        Post(withTerms, _day1, 100m, 0m, _day1.AddDays(15));                 // 45 days past due
        Post(withTerms, _day1.AddDays(50), 80m, 0m, _day1.AddDays(65));      // not yet due
        Post(withTerms, _day1.AddDays(55), 0m, 40m);                         // FIFO: settles 40 of the oldest
        Post(noTerms, _day1.AddDays(20), 70m, 0m);
        await _db.SaveChangesAsync();

        var aging = await new GetArAgingReportQueryHandler(_db, _currentBranch)
            .Handle(new GetArAgingReportQuery(asOf), CancellationToken.None);

        var sita = aging.Single(l => l.CustomerId == withTerms.Id);
        sita.Overdue31To60.ShouldBe(60m);
        sita.NotYetDue.ShouldBe(80m);
        sita.Total.ShouldBe(140m);
        aging.Single(l => l.CustomerId == noTerms.Id).NoDueDate.ShouldBe(70m);
    }

    [Fact]
    public async Task Receivables_Due_Lists_A_Customers_Open_Invoices_With_Days_Overdue()
    {
        var customer = await SeedAsync("Sita", 15);
        var other = await SeedAsync("Gita", 15);
        var asOf = _day1.AddDays(20);

        Post(customer, _day1, 100m, 0m, _day1.AddDays(15));                   // 5 days overdue
        Post(customer, _day1.AddDays(10), 50m, 0m);                           // undated row: current terms → due day 25
        Post(other, _day1, 999m, 0m, _day1.AddDays(15));
        await _db.SaveChangesAsync();

        var due = await new GetReceivablesDueQueryHandler(_db, _currentBranch)
            .Handle(new GetReceivablesDueQuery(asOf, CustomerId: customer.Id), CancellationToken.None);

        due.Invoices.Count.ShouldBe(2);
        due.Invoices[0].DaysOverdue.ShouldBe(5);
        due.Invoices[0].Status.ShouldBe("overdue");
        due.Invoices[1].DueDateUtc.ShouldBe(_day1.AddDays(25));
        due.Invoices[1].Status.ShouldBe("due_soon");
        due.TotalOverdue.ShouldBe(100m);
        due.Customers.ShouldHaveSingleItem().CustomerId.ShouldBe(customer.Id);
    }
}
