using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Ledger.RecordCustomerPayment;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Customers.Tests.Features;

public sealed class RecordCustomerPaymentCommandHandlerTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    private readonly ICustomerReceiptNumberService _receiptNumbers = CreateReceiptNumbers();

    private static ICustomerReceiptNumberService CreateReceiptNumbers()
    {
        var numbers = Substitute.For<ICustomerReceiptNumberService>();
        numbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        numbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(4);
        return numbers;
    }

    private RecordCustomerPaymentCommandHandler CreateSut() =>
        new(_db, _outbox, _currentUser, _currentBranch, _receiptNumbers);

    [Fact]
    public async Task Handle_Should_Assign_Receipt_Number_With_Branch_And_FiscalYear()
    {
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        var customer = await SeedCustomerAsync();

        // 2026-10-09 is in Nepali fiscal year 2083/84 (1 Shrawan 2083 = 2026-07-17).
        var entryId = await CreateSut().Handle(
            new RecordCustomerPaymentCommand(customer.Id, 25m, new DateTime(2026, 10, 9, 6, 0, 0, DateTimeKind.Utc)),
            CancellationToken.None);

        var entry = await _db.CustomerLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == entryId);
        entry.DocumentNumber.ShouldBe("RCP-MAIN-2083/84-00004");
        await _receiptNumbers.Received(1).ReserveNextAsync(branchId, 2083, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Leave_Payment_Unnumbered_When_No_Branch()
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        var customer = await SeedCustomerAsync();

        var entryId = await CreateSut().Handle(
            new RecordCustomerPaymentCommand(customer.Id, 25m, DateTime.UtcNow), CancellationToken.None);

        var entry = await _db.CustomerLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == entryId);
        entry.DocumentNumber.ShouldBeNull();
    }

    [Fact]
    public async Task Cash_Payments_Should_Be_Counted_For_The_Drawer_Of_Their_Branch_Only()
    {
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        var customer = await SeedCustomerAsync(500m);
        var from = DateTime.UtcNow.AddMinutes(-1);

        await CreateSut().Handle(new RecordCustomerPaymentCommand(customer.Id, 40m, DateTime.UtcNow, PaymentMethod: "cash"), CancellationToken.None);
        await CreateSut().Handle(new RecordCustomerPaymentCommand(customer.Id, 25m, DateTime.UtcNow), CancellationToken.None);
        await CreateSut().Handle(new RecordCustomerPaymentCommand(customer.Id, 70m, DateTime.UtcNow, PaymentMethod: "Fonepay"), CancellationToken.None);

        (await _db.CustomerLedgerEntries.AsNoTracking().Select(e => e.PaymentMethod).OrderBy(m => m).ToListAsync())
            .ShouldBe(["CASH", "CASH", "FONEPAY"]);

        var handler = new FSH.Modules.Customers.Features.v1.Ledger.GetCashCustomerReceipts.GetCashCustomerReceiptsQueryHandler(_db);
        (await handler.Handle(new GetCashCustomerReceiptsQuery(branchId, from, DateTime.UtcNow.AddMinutes(1)), CancellationToken.None))
            .ShouldBe(65m);
        (await handler.Handle(new GetCashCustomerReceiptsQuery(Guid.CreateVersion7(), from, DateTime.UtcNow.AddMinutes(1)), CancellationToken.None))
            .ShouldBe(0m);
    }

    private async Task<Customer> SeedCustomerAsync(decimal openingBalance = 100m)
    {
        var customer = Customer.Create("Jane Doe", null, null, null, openingBalance, "C-000001");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(CancellationToken.None);
        return customer;
    }

    [Fact]
    public async Task Handle_Should_StampBranchId_From_ICurrentBranch_When_Resolved()
    {
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        var customer = await SeedCustomerAsync();
        var sut = CreateSut();

        var entryId = await sut.Handle(
            new RecordCustomerPaymentCommand(customer.Id, 30m, DateTime.UtcNow), CancellationToken.None);

        var entry = await _db.CustomerLedgerEntries.FindAsync(entryId);
        entry.ShouldNotBeNull();
        entry!.BranchId.ShouldBe(branchId);
    }

    [Fact]
    public async Task Handle_Should_PersistNullBranchId_When_ICurrentBranch_ReturnsNull()
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        var customer = await SeedCustomerAsync();
        var sut = CreateSut();

        var entryId = await sut.Handle(
            new RecordCustomerPaymentCommand(customer.Id, 30m, DateTime.UtcNow), CancellationToken.None);

        var entry = await _db.CustomerLedgerEntries.FindAsync(entryId);
        entry.ShouldNotBeNull();
        entry!.BranchId.ShouldBeNull();
    }

    [Fact]
    public async Task Handle_Should_ReduceCustomerBalance_And_PostOutboxEvent()
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        var customer = await SeedCustomerAsync(100m);
        var sut = CreateSut();

        await sut.Handle(new RecordCustomerPaymentCommand(customer.Id, 30m, DateTime.UtcNow), CancellationToken.None);

        var saved = await _db.Customers.FindAsync(customer.Id);
        saved!.CurrentBalance.ShouldBe(70m);
        await _outbox.Received(1).AddAsync(
            Arg.Any<FSH.Modules.Customers.Contracts.Events.CustomerPaymentRecordedIntegrationEvent>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Throw_When_CustomerNotFound()
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        var sut = CreateSut();

        await Should.ThrowAsync<NotFoundException>(() =>
            sut.Handle(new RecordCustomerPaymentCommand(Guid.CreateVersion7(), 10m, DateTime.UtcNow), CancellationToken.None).AsTask());
    }

    [Theory]
    [InlineData("bank", "bank")]
    [InlineData("  esewa ", "esewa")]
    [InlineData(null, null)]
    [InlineData("   ", null)]
    public async Task Handle_Should_CarryPaymentMethod_OnTheEvent(string? method, string? expected)
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        var customer = await SeedCustomerAsync();

        await CreateSut().Handle(new RecordCustomerPaymentCommand(customer.Id, 30m, DateTime.UtcNow, null, method), CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<FSH.Modules.Customers.Contracts.Events.CustomerPaymentRecordedIntegrationEvent>(e => e.PaymentMethod == expected),
            Arg.Any<CancellationToken>());
    }

    public void Dispose() => _db.Dispose();
}
