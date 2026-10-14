using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;
using FSH.Modules.Suppliers.IntegrationEventHandlers;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>
/// TDS on supplier payments: the supplier's account is credited the gross (the bill is settled in full), the entry
/// records the TDS, and the event carries it for Accounting (Dr AP gross / Cr Bank net / Cr TDS Payable).
/// </summary>
public sealed class SupplierPaymentTdsTests
{
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly SuppliersDbContext _dbContext = SuppliersDbContextFactory.Create();

    private async Task<Supplier> SupplierAsync()
    {
        var supplier = Supplier.Create("Lekhapal Consulting", null, null, null, null, "601234567", 5000m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();
        return supplier;
    }

    [Fact]
    public async Task Payment_With_Tds_Should_Settle_The_Gross_And_Carry_The_Tds()
    {
        var supplier = await SupplierAsync();
        decimal before = supplier.CurrentBalance;

        var entryId = await new RecordSupplierPaymentCommandHandler(_dbContext, _outbox, _currentUser, _currentBranch, Substitute.For<FSH.Modules.Suppliers.Services.ISupplierPaymentNumberService>(), Substitute.For<Mediator.IMediator>()).Handle(
            new RecordSupplierPaymentCommand(supplier.Id, 5000m, DateTime.UtcNow, "Audit fee",
                PaymentMethod: "bank", TdsAmount: 75m, TdsCategory: "service_vat", TdsRatePercent: 1.5m),
            CancellationToken.None);

        var entry = await _dbContext.SupplierLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == entryId);
        entry.CreditAmount.ShouldBe(5000m, "the bill is settled with the gross");
        entry.TdsAmount.ShouldBe(75m);
        (await _dbContext.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplier.Id)).CurrentBalance.ShouldBe(before - 5000m);

        await _outbox.Received(1).AddAsync(
            Arg.Is<SupplierPaymentRecordedIntegrationEvent>(e =>
                e.Amount == 5000m && e.TdsAmount == 75m && e.TdsCategory == "service_vat" && e.TdsRatePercent == 1.5m
                && e.TdsTaxableAmount == 5000m && e.SupplierPan == "601234567"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Payment_Without_Tds_Should_Carry_None()
    {
        var supplier = await SupplierAsync();

        var entryId = await new RecordSupplierPaymentCommandHandler(_dbContext, _outbox, _currentUser, _currentBranch, Substitute.For<FSH.Modules.Suppliers.Services.ISupplierPaymentNumberService>(), Substitute.For<Mediator.IMediator>()).Handle(
            new RecordSupplierPaymentCommand(supplier.Id, 100m, DateTime.UtcNow), CancellationToken.None);

        (await _dbContext.SupplierLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == entryId)).TdsAmount.ShouldBe(0m);
        await _outbox.Received(1).AddAsync(
            Arg.Is<SupplierPaymentRecordedIntegrationEvent>(e => e.TdsAmount == 0m && e.TdsCategory == null),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ExpenseBill_Should_Record_The_Tds_Withheld_And_Owe_The_Net()
    {
        var supplier = await SupplierAsync();
        decimal before = supplier.CurrentBalance;
        var expenseId = Guid.CreateVersion7();

        await new ExpenseBillRecordedIntegrationEventHandler(_dbContext, _currentBranch).HandleAsync(
            new ExpenseBillRecordedIntegrationEvent(Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Accounting", expenseId, supplier.Id,
                9000m, DateTime.UtcNow, "Shop rent", TdsAmount: 1000m));

        var entry = await _dbContext.SupplierLedgerEntries.AsNoTracking().SingleAsync(e => e.ReferenceId == expenseId);
        entry.DebitAmount.ShouldBe(9000m);
        entry.TdsAmount.ShouldBe(1000m);
        (await _dbContext.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplier.Id)).CurrentBalance.ShouldBe(before + 9000m);
    }

    [Fact]
    public void Validator_Should_Check_The_Tds_Fields()
    {
        var validator = new RecordSupplierPaymentCommandValidator();
        var supplierId = Guid.CreateVersion7();
        var now = DateTime.UtcNow;

        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 100m, now, TdsAmount: 1.5m, TdsCategory: "service_vat")).IsValid.ShouldBeTrue();
        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 100m, now, TdsAmount: 1.5m)).IsValid.ShouldBeFalse("needs a category");
        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 100m, now, TdsAmount: 100m, TdsCategory: "rent")).IsValid.ShouldBeFalse("must leave something to pay");
        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 100m, now, TdsAmount: -1m, TdsCategory: "rent")).IsValid.ShouldBeFalse();
        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 100m, now, TdsAmount: 10m, TdsCategory: "rent", TdsTaxableAmount: 150m)).IsValid.ShouldBeFalse("taxable over the payment");
        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 100m, now, TdsAmount: 10m, TdsCategory: "rent", TdsTaxableAmount: 8m)).IsValid.ShouldBeFalse("TDS over the taxable amount");
        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 100m, now, TdsAmount: 10m, TdsCategory: "rent", TdsRatePercent: 0m)).IsValid.ShouldBeFalse();
    }
}
