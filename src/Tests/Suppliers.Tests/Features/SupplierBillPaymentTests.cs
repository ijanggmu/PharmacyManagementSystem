using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetApAgingReport;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierOpenBills;
using FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;
using FSH.Modules.Suppliers.IntegrationEventHandlers;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

public sealed class SupplierBillPaymentTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    public SupplierBillPaymentTests() => _currentUser.GetTenant().Returns("test-tenant");

    private async Task<Supplier> SeedSupplierAsync()
    {
        var supplier = Supplier.Create("Himal Pharma", null, null, null, null, null, 0m);
        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        return supplier;
    }

    private async Task<Guid> AddBillAsync(Supplier supplier, decimal amount, DateTime date, string number)
    {
        var receiptId = Guid.CreateVersion7();
        decimal balance = supplier.ApplyLedgerEntry(amount, 0m);
        _db.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
            supplier.Id, date, SupplierLedgerEntryType.Purchase, $"Purchase {number}", amount, 0m, balance,
            "DirectGoodsReceipt", receiptId, documentNumber: number, supplierBillNumber: $"BILL-{number}"));
        await _db.SaveChangesAsync();
        return receiptId;
    }

    private Task<Guid> PayAsync(Supplier supplier, decimal amount, Guid? billId = null) =>
        new RecordSupplierPaymentCommandHandler(_db, _outbox, _currentUser, _currentBranch, Substitute.For<FSH.Modules.Suppliers.Services.ISupplierPaymentNumberService>(), Substitute.For<Mediator.IMediator>())
            .Handle(
                new RecordSupplierPaymentCommand(
                    supplier.Id, amount, DateTime.UtcNow, "payment", "cash",
                    billId is null ? null : "DirectGoodsReceipt", billId),
                CancellationToken.None)
            .AsTask();

    private Task<FSH.Modules.Suppliers.Contracts.Dtos.SupplierOpenBillsDto> OpenBillsAsync(Supplier supplier, bool onlyOpen = false) =>
        new GetSupplierOpenBillsQueryHandler(_db, _currentBranch)
            .Handle(new GetSupplierOpenBillsQuery(supplier.Id, onlyOpen), CancellationToken.None)
            .AsTask();

    [Fact]
    public async Task Payment_Against_A_Bill_Settles_That_Bill_And_Others_Go_Oldest_First()
    {
        var supplier = await SeedSupplierAsync();
        var older = await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-20), "GRN-1");
        var newer = await AddBillAsync(supplier, 50m, DateTime.UtcNow.AddDays(-5), "GRN-2");

        await PayAsync(supplier, 50m, newer);
        await PayAsync(supplier, 30m);

        var result = await OpenBillsAsync(supplier);
        var olderBill = result.Bills.Single(b => b.ReferenceId == older);
        var newerBill = result.Bills.Single(b => b.ReferenceId == newer);
        newerBill.Paid.ShouldBe(50m);
        newerBill.Status.ShouldBe("paid");
        olderBill.Paid.ShouldBe(30m);
        olderBill.Outstanding.ShouldBe(70m);
        olderBill.Status.ShouldBe("partially_paid");
        olderBill.DocumentNumber.ShouldBe("GRN-1");
        olderBill.SupplierBillNumber.ShouldBe("BILL-GRN-1");
        result.TotalOutstanding.ShouldBe(70m);

        var onlyOpen = await OpenBillsAsync(supplier, onlyOpen: true);
        onlyOpen.Bills.ShouldHaveSingleItem().ReferenceId.ShouldBe(older);
    }

    [Fact]
    public async Task Bill_Payment_Carries_The_Bill_Reference_And_Numbers()
    {
        var supplier = await SeedSupplierAsync();
        var bill = await AddBillAsync(supplier, 80m, DateTime.UtcNow.AddDays(-3), "GRN-7");

        var entryId = await PayAsync(supplier, 80m, bill);

        var entry = await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == entryId);
        entry.EntryType.ShouldBe(SupplierLedgerEntryType.Payment);
        entry.ReferenceType.ShouldBe("DirectGoodsReceipt");
        entry.ReferenceId.ShouldBe(bill);
        entry.DocumentNumber.ShouldBe("GRN-7");
        await _outbox.Received(1).AddAsync(
            Arg.Is<SupplierPaymentRecordedIntegrationEvent>(e => e.Amount == 80m && e.LedgerEntryId == entryId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Bill_Payment_More_Than_Outstanding_Is_Rejected()
    {
        var supplier = await SeedSupplierAsync();
        var bill = await AddBillAsync(supplier, 60m, DateTime.UtcNow.AddDays(-3), "GRN-3");
        await PayAsync(supplier, 40m, bill);

        await Should.ThrowAsync<CustomException>(() => PayAsync(supplier, 25m, bill));
        (await _db.SupplierLedgerEntries.CountAsync(e => e.EntryType == SupplierLedgerEntryType.Payment)).ShouldBe(1);
    }

    [Fact]
    public async Task Payment_Against_An_Unknown_Bill_Is_NotFound()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 60m, DateTime.UtcNow, "GRN-4");

        await Should.ThrowAsync<NotFoundException>(() => PayAsync(supplier, 10m, Guid.CreateVersion7()));
    }

    [Fact]
    public async Task Voiding_A_Receipt_Credits_That_Receipt()
    {
        var supplier = await SeedSupplierAsync();
        var older = await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-20), "GRN-1");
        var voided = await AddBillAsync(supplier, 40m, DateTime.UtcNow.AddDays(-2), "GRN-2");
        decimal balance = supplier.ApplyLedgerEntry(0m, 40m);
        _db.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
            supplier.Id, DateTime.UtcNow, SupplierLedgerEntryType.Return, "Void", 0m, 40m, balance,
            "DirectGoodsReceiptVoid", voided));
        await _db.SaveChangesAsync();

        var result = await OpenBillsAsync(supplier);
        result.Bills.Single(b => b.ReferenceId == voided).Credited.ShouldBe(40m);
        result.Bills.Single(b => b.ReferenceId == older).Outstanding.ShouldBe(100m);
    }

    [Fact]
    public async Task Ap_Aging_Honours_Bill_Allocation()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-100), "GRN-OLD");
        var recent = await AddBillAsync(supplier, 50m, DateTime.UtcNow.AddDays(-5), "GRN-NEW");
        await PayAsync(supplier, 50m, recent);

        var aging = await new GetApAgingReportQueryHandler(_db, _currentBranch)
            .Handle(new GetApAgingReportQuery(DateTime.UtcNow.AddMinutes(1)), CancellationToken.None);

        var line = aging.ShouldHaveSingleItem();
        line.Over90.ShouldBe(100m);
        line.Current.ShouldBe(0m);
        line.Total.ShouldBe(100m);
    }

    [Fact]
    public async Task Receipt_Paid_At_Entry_Posts_Purchase_And_Payment_Once()
    {
        var supplier = await SeedSupplierAsync();
        var branchId = Guid.CreateVersion7();
        var receiptId = Guid.CreateVersion7();
        var @event = new DirectGoodsReceiptPostedIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "corr", "Purchasing",
            receiptId, supplier.Id, 226m, new DateTime(2026, 10, 8, 0, 0, 0, DateTimeKind.Utc), 26m, branchId,
            ReceiptNumber: "GRN-MAIN-2083/84-00002", SupplierInvoiceNumber: "ZZ-INV-002",
            Payment: new DirectGoodsReceiptPayment("esewa", 200m, new DateTime(2026, 10, 8, 0, 0, 0, DateTimeKind.Utc), "TXN-9"));
        var handler = new DirectGoodsReceiptPostedIntegrationEventHandler(_db, _outbox, _currentBranch);

        await handler.HandleAsync(@event);
        await handler.HandleAsync(@event); // redelivery

        var entries = await _db.SupplierLedgerEntries.AsNoTracking().Where(e => e.SupplierId == supplier.Id).ToListAsync();
        entries.Count.ShouldBe(2);
        var purchase = entries.Single(e => e.EntryType == SupplierLedgerEntryType.Purchase);
        purchase.DocumentNumber.ShouldBe("GRN-MAIN-2083/84-00002");
        purchase.SupplierBillNumber.ShouldBe("ZZ-INV-002");
        purchase.Description.ShouldBe("Purchase GRN-MAIN-2083/84-00002 (bill ZZ-INV-002)");
        purchase.BranchId.ShouldBe(branchId);
        var payment = entries.Single(e => e.EntryType == SupplierLedgerEntryType.Payment);
        payment.CreditAmount.ShouldBe(200m);
        payment.ReferenceId.ShouldBe(receiptId);

        await _outbox.Received(1).AddAsync(
            Arg.Is<SupplierPaymentRecordedIntegrationEvent>(e => e.Amount == 200m && e.PaymentMethod == "esewa"),
            Arg.Any<CancellationToken>());

        var bills = await OpenBillsAsync(supplier);
        bills.Bills.ShouldHaveSingleItem().Outstanding.ShouldBe(26m);
    }

    [Fact]
    public async Task Receipt_On_Credit_Posts_Only_The_Purchase()
    {
        var supplier = await SeedSupplierAsync();
        var @event = new DirectGoodsReceiptPostedIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "corr", "Purchasing",
            Guid.CreateVersion7(), supplier.Id, 100m, DateTime.UtcNow, 0m, Guid.CreateVersion7());

        await new DirectGoodsReceiptPostedIntegrationEventHandler(_db, _outbox, _currentBranch).HandleAsync(@event);

        (await _db.SupplierLedgerEntries.CountAsync(e => e.SupplierId == supplier.Id)).ShouldBe(1);
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }

    public void Dispose() => _db.Dispose();
}
