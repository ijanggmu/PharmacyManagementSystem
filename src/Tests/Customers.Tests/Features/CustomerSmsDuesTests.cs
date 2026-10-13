using FSH.Modules.Customers.Contracts.v1.Sms;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Sms;

namespace Customers.Tests.Features;

/// <summary>The SMS feature's view of customers: consent, contacts and the debts a dues reminder states.</summary>
public sealed class CustomerSmsDuesTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly DateTime _day1 = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);

    public void Dispose() => _db.Dispose();

    private async Task<Customer> SeedAsync(string name, bool consent, int? creditDays = 15)
    {
        var customer = Customer.Create(name, "9841234567", null, null, 0m, "C-" + name);
        customer.SetCreditDays(creditDays);
        customer.SetSmsConsent(consent);
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
    public void Consent_Is_Off_By_Default_And_Tracks_When_It_Changed()
    {
        var customer = Customer.Create("Ram", null, null, null, 0m, "C-1");
        customer.SmsConsent.ShouldBeFalse();
        customer.SetSmsConsent(true);
        customer.SmsConsent.ShouldBeTrue();
        customer.SmsConsentChangedAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public async Task Contacts_Carry_Phone_And_Consent()
    {
        var ram = await SeedAsync("Ram", consent: true);

        var contacts = await new GetCustomerSmsContactsQueryHandler(_db)
            .Handle(new GetCustomerSmsContactsQuery([ram.Id, Guid.NewGuid()]), CancellationToken.None);

        contacts.ShouldHaveSingleItem();
        contacts[0].Phone.ShouldBe("9841234567");
        contacts[0].SmsConsent.ShouldBeTrue();
    }

    [Fact]
    public async Task Scan_Lists_Only_Debts_Overdue_By_N_Days()
    {
        var sita = await SeedAsync("Sita", consent: true);
        var asOf = _day1.AddDays(30);
        Post(sita, _day1, 100m, 0m, _day1.AddDays(15));               // 15 days overdue
        Post(sita, _day1.AddDays(20), 50m, 0m, _day1.AddDays(27));    // 3 days overdue
        await _db.SaveChangesAsync();

        var dues = await new GetCustomerSmsDuesQueryHandler(_db)
            .Handle(new GetCustomerSmsDuesQuery(asOf, MinDaysOverdue: 7), CancellationToken.None);

        var invoices = dues.ShouldHaveSingleItem().Invoices;
        invoices.ShouldHaveSingleItem().Outstanding.ShouldBe(100m);
        invoices[0].DaysOverdue.ShouldBe(15);
    }

    [Fact]
    public async Task One_Customer_Lists_Every_Open_Debt_After_Fifo()
    {
        var hari = await SeedAsync("Hari", consent: false);
        var asOf = _day1.AddDays(30);
        Post(hari, _day1, 100m, 0m, _day1.AddDays(15));
        Post(hari, _day1.AddDays(25), 80m, 0m, _day1.AddDays(40));    // not yet due
        Post(hari, _day1.AddDays(26), 0m, 60m);                        // settles 60 of the oldest
        await _db.SaveChangesAsync();

        var dues = await new GetCustomerSmsDuesQueryHandler(_db)
            .Handle(new GetCustomerSmsDuesQuery(asOf, hari.Id), CancellationToken.None);

        var customer = dues.ShouldHaveSingleItem();
        customer.Contact.SmsConsent.ShouldBeFalse();
        customer.Invoices.Sum(i => i.Outstanding).ShouldBe(120m);
    }

    [Theory]
    [InlineData(10, 30, 7, true)]
    [InlineData(5, 30, 7, false)]
    [InlineData(null, 8, 7, true)]   // no due date: counts its age
    [InlineData(null, 6, 7, false)]
    public void Overdue_By_N_Days(int? daysOverdue, int ageDays, int minDays, bool expected)
    {
        var invoice = new CustomerSmsDueInvoiceDto(Guid.NewGuid(), "INV-1", 10m, DateTime.UtcNow, null, daysOverdue, ageDays);
        GetCustomerSmsDuesQueryHandler.IsOverdueBy(invoice, minDays).ShouldBe(expected);
    }
}
