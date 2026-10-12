using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.IntegrationEventHandlers;
using FSH.Modules.Suppliers.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>
/// Integration events can be redelivered (the inbox mark commits separately from the handler): a source
/// document already on the AP ledger must not be posted again.
/// </summary>
public sealed class SupplierLedgerIdempotencyTests
{
    private readonly SuppliersDbContext _dbContext = SuppliersDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    private SupplierLedgerService LedgerService() => new(_dbContext, _currentBranch);

    private async Task<Supplier> SeedSupplierAsync()
    {
        var supplier = Supplier.Create("Acme Pharma", null, null, null, null, null, 0m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();
        return supplier;
    }

    #region Happy Path

    [Fact]
    public async Task Redelivered_ConsignmentSettled_Should_Post_The_Purchase_Once()
    {
        var supplier = await SeedSupplierAsync();
        var sut = new ConsignmentSettledIntegrationEventHandler(LedgerService());
        var @event = new ConsignmentSettledIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", Guid.CreateVersion7().ToString(), "Inventory",
            SettlementId: Guid.CreateVersion7(), SupplierId: supplier.Id, TotalAmount: 250m,
            SettlementDateUtc: DateTime.UtcNow);

        await sut.HandleAsync(@event);
        await sut.HandleAsync(@event);

        (await _dbContext.SupplierLedgerEntries.CountAsync(e => e.SupplierId == supplier.Id)).ShouldBe(1);
        supplier.CurrentBalance.ShouldBe(250m);
    }

    [Fact]
    public async Task Redelivered_DirectGoodsReceiptVoided_Should_Post_The_Return_Once()
    {
        var supplier = await SeedSupplierAsync();
        await LedgerService().RecordPurchaseAsync(supplier.Id, 400m, DateTime.UtcNow, "Bill", "DirectGoodsReceipt", Guid.CreateVersion7());
        var sut = new DirectGoodsReceiptVoidedIntegrationEventHandler(LedgerService());
        var @event = new DirectGoodsReceiptVoidedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", Guid.CreateVersion7().ToString(), "Purchasing",
            ReceiptId: Guid.CreateVersion7(), SupplierId: supplier.Id, GrossAmount: 400m,
            ReceiptDateUtc: DateTime.UtcNow, Reason: "Entered twice");

        await sut.HandleAsync(@event);
        await sut.HandleAsync(@event);

        (await _dbContext.SupplierLedgerEntries.CountAsync(e => e.EntryType == SupplierLedgerEntryType.Return)).ShouldBe(1);
        supplier.CurrentBalance.ShouldBe(0m);
    }

    [Fact]
    public async Task DirectGoodsReceiptVoided_Should_Date_The_Ap_Credit_At_The_Void()
    {
        var supplier = await SeedSupplierAsync();
        var receiptDate = DateTime.UtcNow.AddDays(-45);
        var voidedAt = DateTime.UtcNow.AddMinutes(-5);
        await LedgerService().RecordPurchaseAsync(supplier.Id, 400m, receiptDate, "Bill", "DirectGoodsReceipt", Guid.CreateVersion7());
        var sut = new DirectGoodsReceiptVoidedIntegrationEventHandler(LedgerService());

        await sut.HandleAsync(new DirectGoodsReceiptVoidedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", Guid.CreateVersion7().ToString(), "Purchasing",
            ReceiptId: Guid.CreateVersion7(), SupplierId: supplier.Id, GrossAmount: 400m,
            ReceiptDateUtc: receiptDate, Reason: "Entered twice", VoidedAtUtc: voidedAt));

        var credit = await _dbContext.SupplierLedgerEntries.SingleAsync(e => e.EntryType == SupplierLedgerEntryType.Return);
        credit.EntryDateUtc.ShouldBe(voidedAt);
    }

    [Fact]
    public async Task DirectGoodsReceiptVoided_Without_VoidedAt_Should_Fall_Back_To_OccurredOn()
    {
        var supplier = await SeedSupplierAsync();
        var occurredOn = DateTime.UtcNow.AddMinutes(-2);
        await LedgerService().RecordPurchaseAsync(supplier.Id, 400m, DateTime.UtcNow.AddDays(-45), "Bill", "DirectGoodsReceipt", Guid.CreateVersion7());
        var sut = new DirectGoodsReceiptVoidedIntegrationEventHandler(LedgerService());

        await sut.HandleAsync(new DirectGoodsReceiptVoidedIntegrationEvent(
            Guid.CreateVersion7(), occurredOn, "test-tenant", Guid.CreateVersion7().ToString(), "Purchasing",
            ReceiptId: Guid.CreateVersion7(), SupplierId: supplier.Id, GrossAmount: 400m,
            ReceiptDateUtc: DateTime.UtcNow.AddDays(-45), Reason: "Entered twice"));

        var credit = await _dbContext.SupplierLedgerEntries.SingleAsync(e => e.EntryType == SupplierLedgerEntryType.Return);
        credit.EntryDateUtc.ShouldBe(occurredOn);
    }

    [Fact]
    public async Task Redelivered_MedicineStockReceived_Should_Post_The_Purchase_Once()
    {
        var supplier = await SeedSupplierAsync();
        var sut = new MedicineStockReceivedFromSupplierIntegrationEventHandler(LedgerService());
        var @event = new MedicineStockReceivedFromSupplierIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", Guid.CreateVersion7().ToString(), "Inventory",
            ReceiptId: Guid.CreateVersion7(), MedicineId: Guid.CreateVersion7(), SupplierId: supplier.Id,
            GrossAmount: 120m, ReceiptDateUtc: DateTime.UtcNow, SupplierInvoiceNumber: "INV-1");

        await sut.HandleAsync(@event);
        await sut.HandleAsync(@event);

        (await _dbContext.SupplierLedgerEntries.CountAsync(e => e.SupplierId == supplier.Id)).ShouldBe(1);
        supplier.CurrentBalance.ShouldBe(120m);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public async Task Different_Documents_Of_The_Same_Type_Should_Each_Be_Posted()
    {
        var supplier = await SeedSupplierAsync();

        await LedgerService().RecordPurchaseAsync(supplier.Id, 100m, DateTime.UtcNow, "A", "ConsignmentSettlement", Guid.CreateVersion7());
        await LedgerService().RecordPurchaseAsync(supplier.Id, 50m, DateTime.UtcNow, "B", "ConsignmentSettlement", Guid.CreateVersion7());

        (await _dbContext.SupplierLedgerEntries.CountAsync(e => e.SupplierId == supplier.Id)).ShouldBe(2);
        supplier.CurrentBalance.ShouldBe(150m);
    }

    [Fact]
    public async Task Onboarding_Opening_Balances_Sharing_A_Session_Reference_Should_Not_Be_Deduplicated()
    {
        var supplier = await SeedSupplierAsync();
        var sessionId = Guid.CreateVersion7();

        await LedgerService().RecordPurchaseAsync(
            supplier.Id, 100m, DateTime.UtcNow, "Opening", "MigrationOpeningSupplier", sessionId);
        await LedgerService().RecordPurchaseAsync(
            supplier.Id, 30m, DateTime.UtcNow, "Opening", "MigrationOpeningSupplier", sessionId);

        (await _dbContext.SupplierLedgerEntries.CountAsync(e => e.SupplierId == supplier.Id)).ShouldBe(2);
        supplier.CurrentBalance.ShouldBe(130m);
    }

    [Fact]
    public async Task A_Purchase_And_A_Return_Of_The_Same_Document_Should_Both_Be_Posted()
    {
        var supplier = await SeedSupplierAsync();
        var documentId = Guid.CreateVersion7();

        await LedgerService().RecordPurchaseAsync(supplier.Id, 80m, DateTime.UtcNow, "Bill", "Adjustment", documentId);
        await LedgerService().RecordReturnAsync(supplier.Id, 80m, DateTime.UtcNow, "Reversal", "Adjustment", documentId);

        (await _dbContext.SupplierLedgerEntries.CountAsync(e => e.SupplierId == supplier.Id)).ShouldBe(2);
        supplier.CurrentBalance.ShouldBe(0m);
    }

    #endregion
}
