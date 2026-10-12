using System.Net;
using FluentValidation.TestHelper;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerSummary;
using FSH.Modules.Customers.Features.v1.Customers.LookupCustomers;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Reports;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Customers.Tests.Features;

/// <summary>Opening balances (permission, validation, ledger entry + Accounting event), the compliance
/// name lookup that keeps deleted customers, and the server-side customer summary.</summary>
public sealed class CustomerOpeningBalanceTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly ICustomerCodeService _codes = Substitute.For<ICustomerCodeService>();
    private readonly ICustomerCreditPermissionGuard _guard = Substitute.For<ICustomerCreditPermissionGuard>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public CustomerOpeningBalanceTests()
    {
        _codes.NextAsync(Arg.Any<CancellationToken>()).Returns("C-000100");
        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
    }

    private CreateCustomerCommandHandler Sut() => new(_db, _codes, _guard, _outbox, _currentUser, _currentBranch);

    [Fact]
    public async Task Opening_Balance_Without_The_Credit_Permission_Should_Be_Forbidden()
    {
        _guard.EnsureCanSetOpeningBalanceAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new CustomException("no", (IEnumerable<string>?)null, HttpStatusCode.Forbidden));

        var ex = await Should.ThrowAsync<CustomException>(() =>
            Sut().Handle(new CreateCustomerCommand("Hari", OpeningBalance: 5000m), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        _db.Customers.ShouldBeEmpty();
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }

    [Fact]
    public async Task No_Opening_Balance_Should_Not_Need_The_Permission_Or_Post_Anything()
    {
        _guard.EnsureCanSetOpeningBalanceAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new CustomException("no", (IEnumerable<string>?)null, HttpStatusCode.Forbidden));

        await Sut().Handle(new CreateCustomerCommand("Hari"), CancellationToken.None);

        _db.CustomerLedgerEntries.ShouldBeEmpty();
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }

    [Fact]
    public async Task Receivable_Opening_Balance_Should_Debit_The_Ledger_And_Raise_The_Accounting_Event()
    {
        var id = await Sut().Handle(new CreateCustomerCommand("Sita", OpeningBalance: 1250.50m), CancellationToken.None);

        var entry = await _db.CustomerLedgerEntries.SingleAsync();
        entry.CustomerId.ShouldBe(id);
        entry.EntryType.ShouldBe(CustomerLedgerEntryType.OpeningBalance);
        entry.DebitAmount.ShouldBe(1250.50m);
        entry.BranchId.ShouldBe(_branchId);
        (await _db.Customers.SingleAsync()).CurrentBalance.ShouldBe(1250.50m);

        await _outbox.Received(1).AddAsync(
            Arg.Is<IIntegrationEvent>(e => e is CustomerOpeningBalanceRecordedIntegrationEvent
                && ((CustomerOpeningBalanceRecordedIntegrationEvent)e).Amount == 1250.50m
                && ((CustomerOpeningBalanceRecordedIntegrationEvent)e).LedgerEntryId == entry.Id
                && ((CustomerOpeningBalanceRecordedIntegrationEvent)e).CustomerId == id
                && ((CustomerOpeningBalanceRecordedIntegrationEvent)e).BranchId == _branchId
                && e.TenantId == "test-tenant"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Advance_Opening_Balance_Should_Credit_The_Ledger_And_Carry_A_Negative_Amount()
    {
        await Sut().Handle(new CreateCustomerCommand("Gita", OpeningBalance: -300m), CancellationToken.None);

        var entry = await _db.CustomerLedgerEntries.SingleAsync();
        entry.CreditAmount.ShouldBe(300m);
        entry.DebitAmount.ShouldBe(0m);
        await _outbox.Received(1).AddAsync(
            Arg.Is<IIntegrationEvent>(e => ((CustomerOpeningBalanceRecordedIntegrationEvent)e).Amount == -300m),
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(0.001)]
    [InlineData(10000000.01)]
    [InlineData(-10000000.01)]
    public void Validator_Should_Reject_Bad_Opening_Balances(double amount)
    {
        var result = new CreateCustomerCommandValidator().TestValidate(new CreateCustomerCommand("X", OpeningBalance: (decimal)amount));
        result.ShouldHaveValidationErrorFor(c => c.OpeningBalance);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1250.5)]
    [InlineData(-10000000)]
    public void Validator_Should_Accept_Sane_Opening_Balances(double amount)
    {
        var result = new CreateCustomerCommandValidator().TestValidate(new CreateCustomerCommand("X", OpeningBalance: (decimal)amount));
        result.ShouldNotHaveValidationErrorFor(c => c.OpeningBalance);
    }

    // ---- compliance-register lookup keeps deleted customers ------------------------------------------

    [Fact]
    public async Task Lookup_By_Ids_Should_Include_Deleted_Customers_With_Their_Email()
    {
        var kept = Customer.Create("Kept", "980", "kept@x.np", null, 0m, "C-000001");
        var deleted = Customer.Create("Gone", null, "gone@x.np", null, 0m, "C-000002");
        _db.Customers.AddRange(kept, deleted);
        await _db.SaveChangesAsync();
        _db.Entry(deleted).Property(c => c.IsDeleted).CurrentValue = true;
        await _db.SaveChangesAsync();

        var rows = await new LookupCustomersQueryHandler(_db)
            .Handle(new LookupCustomersQuery([kept.Id, deleted.Id], null, 2), CancellationToken.None);

        rows.Count.ShouldBe(2);
        rows.Single(r => r.Id == deleted.Id).Name.ShouldBe("Gone");
        rows.Single(r => r.Id == deleted.Id).Email.ShouldBe("gone@x.np");
    }

    // ---- customer summary ----------------------------------------------------------------------------

    [Fact]
    public async Task Summary_Should_Combine_Completed_Sales_And_Prescriptions_For_The_Customer()
    {
        var customer = Customer.Create("Ram", null, null, null, 0m, "C-000003");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();

        var mediator = Substitute.For<IMediator>();
        IReadOnlyDictionary<Guid, CustomerSalesAggregateDto> aggregate =
            new Dictionary<Guid, CustomerSalesAggregateDto> { [customer.Id] = new(3, 4500m) };
        mediator.Send(Arg.Is<GetCustomerSalesAggregateQuery>(q => q.CustomerId == customer.Id && q.BranchId == null), Arg.Any<CancellationToken>())
            .Returns(aggregate);
        mediator.Send(Arg.Any<SearchPrescriptionsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResponse<PrescriptionDto> { TotalCount = 7, PageNumber = 1, PageSize = 1 });

        var summary = await new GetCustomerSummaryQueryHandler(_db, mediator, TimeProvider.System)
            .Handle(new GetCustomerSummaryQuery(customer.Id), CancellationToken.None);

        summary.PurchaseCount.ShouldBe(3);
        summary.TotalSpent.ShouldBe(4500m);
        summary.PrescriptionCount.ShouldBe(7);
    }

    [Fact]
    public async Task Summary_Of_An_Unknown_Customer_Should_Be_404()
    {
        await Should.ThrowAsync<NotFoundException>(() => new GetCustomerSummaryQueryHandler(_db, Substitute.For<IMediator>(), TimeProvider.System)
            .Handle(new GetCustomerSummaryQuery(Guid.CreateVersion7()), CancellationToken.None).AsTask());
    }

    public void Dispose() => _db.Dispose();
}
