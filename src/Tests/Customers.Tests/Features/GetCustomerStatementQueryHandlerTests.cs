using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Ledger.GetCustomerStatement;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Customers.Tests.Features;

public sealed class GetCustomerStatementQueryHandlerTests : IDisposable
{
    private static readonly DateTime From = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime To = new(2026, 9, 30, 23, 59, 59, DateTimeKind.Utc);

    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    // Caller holding Branches.ViewAll: an explicit branch filter passes through, null means all branches.
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly GetCustomerStatementQueryHandler _sut;

    public GetCustomerStatementQueryHandlerTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _sut = new GetCustomerStatementQueryHandler(_db, _currentBranch);
    }

    private async Task<Customer> AddCustomerAsync(int? creditDays = null)
    {
        var customer = Customer.Create("Ram Bahadur", "9800000000", null, null, 0m, "C-000001", creditLimit: 5000m);
        customer.SetCreditDays(creditDays);
        customer.SetPanNumber("123456789");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(CancellationToken.None);
        return customer;
    }

    private static CustomerLedgerEntry Sale(Guid customerId, DateTime at, decimal amount, Guid? branchId = null, string? doc = null) =>
        CustomerLedgerEntry.Create(customerId, at, CustomerLedgerEntryType.Sale, "Credit sale", amount, 0m, 0m,
            branchId: branchId, documentNumber: doc);

    private static CustomerLedgerEntry Payment(Guid customerId, DateTime at, decimal amount, Guid? branchId = null) =>
        CustomerLedgerEntry.Create(customerId, at, CustomerLedgerEntryType.Payment, "Payment", 0m, amount, 0m, branchId: branchId);

    [Fact]
    public async Task Opening_Balance_Should_Include_Entries_Before_The_Period()
    {
        var customer = await AddCustomerAsync();
        _db.CustomerLedgerEntries.AddRange(
            Sale(customer.Id, From.AddDays(-20), 1000m),
            Payment(customer.Id, From.AddDays(-10), 300m),
            Sale(customer.Id, From.AddDays(5), 200m, doc: "INV-1"),
            Payment(customer.Id, From.AddDays(10), 100m),
            Sale(customer.Id, To.AddDays(3), 999m)); // after the period: ignored
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetCustomerStatementQuery(customer.Id, From, To), CancellationToken.None);

        result.OpeningBalance.ShouldBe(700m);
        result.Lines.Count.ShouldBe(2);
        result.Lines[0].DocumentNumber.ShouldBe("INV-1");
        result.Lines[0].RunningBalance.ShouldBe(900m);
        result.Lines[1].RunningBalance.ShouldBe(800m);
        result.TotalDebits.ShouldBe(200m);
        result.TotalCredits.ShouldBe(100m);
        result.ClosingBalance.ShouldBe(800m);
        result.CustomerName.ShouldBe("Ram Bahadur");
        result.CustomerCode.ShouldBe("C-000001");
        result.PanNumber.ShouldBe("123456789");
        result.CreditLimit.ShouldBe(5000m);
    }

    [Fact]
    public async Task Closing_Balance_Should_Equal_Opening_When_No_Lines()
    {
        var customer = await AddCustomerAsync();
        _db.CustomerLedgerEntries.Add(Sale(customer.Id, From.AddDays(-3), 450m));
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetCustomerStatementQuery(customer.Id, From, To), CancellationToken.None);

        result.Lines.ShouldBeEmpty();
        result.OpeningBalance.ShouldBe(450m);
        result.ClosingBalance.ShouldBe(450m);
        result.TotalDebits.ShouldBe(0m);
    }

    [Fact]
    public async Task Voided_Payment_Should_Be_Flagged()
    {
        var customer = await AddCustomerAsync();
        var sale = Sale(customer.Id, From.AddDays(1), 500m);
        var payment = Payment(customer.Id, From.AddDays(2), 500m);
        var voidEntry = CustomerLedgerEntry.Create(customer.Id, From.AddDays(3), CustomerLedgerEntryType.Adjustment,
            "Payment voided", 500m, 0m, 0m, referenceType: CustomerLedgerEntry.PaymentVoidReference, referenceId: payment.Id);
        _db.CustomerLedgerEntries.AddRange(sale, payment, voidEntry);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetCustomerStatementQuery(customer.Id, From, To), CancellationToken.None);

        result.Lines.Count.ShouldBe(3);
        result.Lines.Single(l => l.Id == payment.Id).IsVoided.ShouldBeTrue();
        result.Lines.Single(l => l.Id == sale.Id).IsVoided.ShouldBeFalse();
        result.Lines.Single(l => l.Id == voidEntry.Id).DueDateUtc.ShouldBeNull();
        result.ClosingBalance.ShouldBe(500m);
        // The voided payment no longer settles the sale: ageing shows it open.
        result.Ageing.Current.ShouldBe(500m);
        result.Ageing.NetBalance.ShouldBe(500m);
    }

    [Fact]
    public async Task Ageing_Should_Bucket_Open_Debits_By_Age_As_Of_Period_End()
    {
        var customer = await AddCustomerAsync(creditDays: 30);
        _db.CustomerLedgerEntries.AddRange(
            Sale(customer.Id, To.AddDays(-100), 400m), // over 90
            Sale(customer.Id, To.AddDays(-75), 300m),  // 61-90
            Sale(customer.Id, To.AddDays(-45), 200m),  // 31-60
            Sale(customer.Id, To.AddDays(-5), 100m),   // current
            Payment(customer.Id, To.AddDays(-2), 150m)); // settles 150 of the oldest
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetCustomerStatementQuery(customer.Id, From, To), CancellationToken.None);

        result.Ageing.Over90.ShouldBe(250m);
        result.Ageing.Days61To90.ShouldBe(300m);
        result.Ageing.Days31To60.ShouldBe(200m);
        result.Ageing.Current.ShouldBe(100m);
        result.Ageing.UnappliedAdvance.ShouldBe(0m);
        result.Ageing.NetBalance.ShouldBe(850m);
        result.Ageing.NetBalance.ShouldBe(result.ClosingBalance);
        // Everything but the 5-day-old sale is past its 30-day terms.
        result.Ageing.OverdueAmount.ShouldBe(750m);
        result.Ageing.EarliestDueDateUtc.ShouldBe(To.AddDays(-70));
        result.Lines.Single(l => l.DebitAmount == 100m).DueDateUtc.ShouldBe(To.AddDays(25));
    }

    [Fact]
    public async Task Ageing_Should_Report_Unapplied_Advance()
    {
        var customer = await AddCustomerAsync();
        _db.CustomerLedgerEntries.AddRange(
            Sale(customer.Id, From.AddDays(1), 100m),
            Payment(customer.Id, From.AddDays(2), 250m));
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetCustomerStatementQuery(customer.Id, From, To), CancellationToken.None);

        result.Ageing.Current.ShouldBe(0m);
        result.Ageing.UnappliedAdvance.ShouldBe(150m);
        result.Ageing.NetBalance.ShouldBe(-150m);
        result.ClosingBalance.ShouldBe(-150m);
    }

    [Fact]
    public async Task Branch_Filter_Should_Limit_Lines_And_Opening_Balance()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var customer = await AddCustomerAsync();
        _db.CustomerLedgerEntries.AddRange(
            Sale(customer.Id, From.AddDays(-5), 100m, branchA),
            Sale(customer.Id, From.AddDays(-5), 900m, branchB),
            Sale(customer.Id, From.AddDays(2), 50m, branchA),
            Sale(customer.Id, From.AddDays(3), 70m, branchB));
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetCustomerStatementQuery(customer.Id, From, To, branchA), CancellationToken.None);

        result.OpeningBalance.ShouldBe(100m);
        result.Lines.Count.ShouldBe(1);
        result.Lines[0].DebitAmount.ShouldBe(50m);
        result.ClosingBalance.ShouldBe(150m);
        // Only branch A's open debits are aged: the 100 (35 days old at period end) and the 50.
        result.Ageing.Days31To60.ShouldBe(100m);
        result.Ageing.Current.ShouldBe(50m);
        result.Ageing.NetBalance.ShouldBe(150m);

        var all = await _sut.Handle(new GetCustomerStatementQuery(customer.Id, From, To), CancellationToken.None);
        all.OpeningBalance.ShouldBe(1000m);
        all.ClosingBalance.ShouldBe(1120m);
    }

    [Fact]
    public async Task Missing_Customer_Should_Throw_NotFound()
    {
        await Should.ThrowAsync<NotFoundException>(async () =>
            await _sut.Handle(new GetCustomerStatementQuery(Guid.CreateVersion7(), From, To), CancellationToken.None));
    }

    [Fact]
    public void Validator_Should_Reject_Inverted_And_Too_Long_Ranges()
    {
        var validator = new GetCustomerStatementQueryValidator();
        var id = Guid.CreateVersion7();

        validator.Validate(new GetCustomerStatementQuery(id, From, To)).IsValid.ShouldBeTrue();
        validator.Validate(new GetCustomerStatementQuery(id, To, From)).IsValid.ShouldBeFalse();
        validator.Validate(new GetCustomerStatementQuery(id, From.AddYears(-3), To)).IsValid.ShouldBeFalse();
        validator.Validate(new GetCustomerStatementQuery(Guid.Empty, From, To)).IsValid.ShouldBeFalse();
    }

    public void Dispose() => _db.Dispose();
}
