using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierOpenBills;
using FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;
using FSH.Modules.Suppliers.IntegrationEventHandlers;
using FSH.Modules.Suppliers.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>
/// A pay-later expense from Accounting becomes a bill on the supplier's AP ledger (once, however often the event is
/// delivered), is payable through the normal supplier payment flow, and is credited back — closing that bill — when
/// the expense is deleted.
/// </summary>
public sealed class ExpenseBillLedgerTests : IDisposable
{
    private static readonly DateTime ExpenseDate = new(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc);

    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();

    public ExpenseBillLedgerTests() => _currentUser.GetTenant().Returns("test-tenant");

    public void Dispose() => _db.Dispose();

    private async Task<Supplier> SeedSupplierAsync()
    {
        var supplier = Supplier.Create("Nepal Telecom", null, null, null, null, "301234567", 0m);
        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        return supplier;
    }

    private static ExpenseBillRecordedIntegrationEvent Recorded(Guid supplierId, Guid expenseId, decimal amount = 1130m, Guid? branchId = null) =>
        new(Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", Guid.CreateVersion7().ToString(), "Accounting",
            expenseId, supplierId, amount, ExpenseDate, "Internet", BillNumber: "NT-55", Description: "June internet", BranchId: branchId);

    private static ExpenseBillVoidedIntegrationEvent Voided(Guid supplierId, Guid expenseId, DateTime voidedAt, decimal amount = 1130m) =>
        new(Guid.CreateVersion7(), voidedAt, "test-tenant", Guid.CreateVersion7().ToString(), "Accounting",
            expenseId, supplierId, amount, voidedAt, "expense deleted", BillNumber: "NT-55");

    private ExpenseBillRecordedIntegrationEventHandler RecordedHandler() => new(_db, _currentBranch);

    private ExpenseBillVoidedIntegrationEventHandler VoidedHandler() => new(new SupplierLedgerService(_db, _currentBranch));

    private Task<FSH.Modules.Suppliers.Contracts.Dtos.SupplierOpenBillsDto> BillsAsync(Supplier supplier) =>
        new GetSupplierOpenBillsQueryHandler(_db, _currentBranch)
            .Handle(new GetSupplierOpenBillsQuery(supplier.Id, OnlyOpen: false), CancellationToken.None)
            .AsTask();

    [Fact]
    public async Task Recorded_Should_AddTheBill_Once_When_Redelivered()
    {
        var supplier = await SeedSupplierAsync();
        var expenseId = Guid.CreateVersion7();
        var branchId = Guid.CreateVersion7();
        var @event = Recorded(supplier.Id, expenseId, branchId: branchId);

        await RecordedHandler().HandleAsync(@event);
        await RecordedHandler().HandleAsync(@event);

        var entry = await _db.SupplierLedgerEntries.SingleAsync();
        entry.EntryType.ShouldBe(SupplierLedgerEntryType.Purchase);
        entry.DebitAmount.ShouldBe(1130m);
        entry.EntryDateUtc.ShouldBe(ExpenseDate);
        entry.ReferenceType.ShouldBe(ExpenseBillReference.ReferenceType);
        entry.ReferenceId.ShouldBe(expenseId);
        entry.SupplierBillNumber.ShouldBe("NT-55");
        entry.BranchId.ShouldBe(branchId);
        entry.Description.ShouldBe("Expense: Internet (bill NT-55) — June internet");
        supplier.CurrentBalance.ShouldBe(1130m);
    }

    [Fact]
    public async Task Recorded_Bill_Should_BePayable_ThroughTheSupplierPaymentFlow()
    {
        var supplier = await SeedSupplierAsync();
        var expenseId = Guid.CreateVersion7();
        await RecordedHandler().HandleAsync(Recorded(supplier.Id, expenseId));

        var open = (await BillsAsync(supplier)).Bills.Single();
        open.ReferenceType.ShouldBe(ExpenseBillReference.ReferenceType);
        open.ReferenceId.ShouldBe(expenseId);
        open.Status.ShouldBe("open");

        await new RecordSupplierPaymentCommandHandler(_db, _outbox, _currentUser, _currentBranch, Substitute.For<FSH.Modules.Suppliers.Services.ISupplierPaymentNumberService>(), Substitute.For<Mediator.IMediator>()).Handle(
            new RecordSupplierPaymentCommand(supplier.Id, 1130m, DateTime.UtcNow, "paid", "bank", open.ReferenceType, open.ReferenceId),
            CancellationToken.None);

        var paid = (await BillsAsync(supplier)).Bills.Single();
        paid.Paid.ShouldBe(1130m);
        paid.Status.ShouldBe("paid");
        supplier.CurrentBalance.ShouldBe(0m);
    }

    [Fact]
    public async Task Voided_Should_CreditTheBillBack_Once_And_CloseIt()
    {
        var supplier = await SeedSupplierAsync();
        var expenseId = Guid.CreateVersion7();
        var otherBill = Guid.CreateVersion7();
        // An older open bill: the void must close the expense's own bill, not this one (FIFO would pick it).
        await new SupplierLedgerService(_db, _currentBranch).RecordPurchaseAsync(
            supplier.Id, 500m, ExpenseDate.AddDays(-30), "Older purchase", "DirectGoodsReceipt", otherBill);
        await RecordedHandler().HandleAsync(Recorded(supplier.Id, expenseId));
        var voidedAt = DateTime.UtcNow.AddMinutes(-1);
        var voided = Voided(supplier.Id, expenseId, voidedAt);

        await VoidedHandler().HandleAsync(voided);
        await VoidedHandler().HandleAsync(voided);

        var credit = await _db.SupplierLedgerEntries.SingleAsync(e => e.EntryType == SupplierLedgerEntryType.Return);
        credit.CreditAmount.ShouldBe(1130m);
        credit.EntryDateUtc.ShouldBe(voidedAt);
        credit.ReferenceType.ShouldBe(ExpenseBillReference.VoidReferenceType);
        credit.ReferenceId.ShouldBe(expenseId);
        supplier.CurrentBalance.ShouldBe(500m);

        var bills = (await BillsAsync(supplier)).Bills;
        bills.Single(b => b.ReferenceId == expenseId).Outstanding.ShouldBe(0m);
        bills.Single(b => b.ReferenceId == expenseId).Credited.ShouldBe(1130m);
        bills.Single(b => b.ReferenceId == otherBill).Outstanding.ShouldBe(500m);
    }

    [Fact]
    public async Task Events_With_NoAmount_Should_PostNothing()
    {
        var supplier = await SeedSupplierAsync();

        await RecordedHandler().HandleAsync(Recorded(supplier.Id, Guid.CreateVersion7(), amount: 0m));
        await VoidedHandler().HandleAsync(Voided(supplier.Id, Guid.CreateVersion7(), DateTime.UtcNow, amount: 0m));

        (await _db.SupplierLedgerEntries.CountAsync()).ShouldBe(0);
    }
}
