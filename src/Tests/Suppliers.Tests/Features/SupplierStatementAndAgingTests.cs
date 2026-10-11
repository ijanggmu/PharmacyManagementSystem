using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetApAgingReport;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierStatement;
using FSH.Modules.Suppliers.IntegrationEventHandlers;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>Statement balances follow entry dates (not insertion order), payables are dated by receipt, and
/// AP aging allocates a supplier's credits across every branch before showing one branch.</summary>
public sealed class SupplierStatementAndAgingTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly DateTime _day1 = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);

    public void Dispose() => _db.Dispose();

    private static ICurrentBranch Branch(Guid? resolved)
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(resolved);
        return branch;
    }

    private async Task<Supplier> SeedSupplierAsync()
    {
        var supplier = Supplier.Create("Himal Pharma", null, null, null, null, null, 0m);
        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        return supplier;
    }

    private void Post(Supplier supplier, DateTime date, decimal debit, decimal credit, Guid? branchId = null, string? referenceType = null, Guid? referenceId = null)
    {
        decimal running = supplier.ApplyLedgerEntry(debit, credit);
        _db.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
            supplier.Id, date, debit > 0 ? SupplierLedgerEntryType.Purchase : SupplierLedgerEntryType.Payment,
            null, debit, credit, running, referenceType, referenceId, branchId));
    }

    [Fact]
    public async Task Statement_Should_Compute_Balances_In_Date_Order_With_A_Backdated_Entry()
    {
        var supplier = await SeedSupplierAsync();
        Post(supplier, _day1.AddDays(5), 100m, 0m);   // inserted first, dated day 6
        await _db.SaveChangesAsync();
        Post(supplier, _day1.AddDays(1), 40m, 0m);    // inserted later, BACKDATED to day 2
        await _db.SaveChangesAsync();
        Post(supplier, _day1.AddDays(7), 0m, 30m);
        await _db.SaveChangesAsync();

        var statement = await new GetSupplierStatementQueryHandler(_db, Branch(null))
            .Handle(new GetSupplierStatementQuery(supplier.Id, _day1, _day1.AddDays(30)), CancellationToken.None);

        statement.OpeningBalance.ShouldBe(0m);
        statement.Lines.Select(l => l.RunningBalance).ShouldBe([40m, 140m, 110m]);
        statement.ClosingBalance.ShouldBe(110m);
    }

    [Fact]
    public async Task Statement_Opening_Balance_Should_Include_A_Backdated_Entry_Before_The_Period()
    {
        var supplier = await SeedSupplierAsync();
        Post(supplier, _day1.AddDays(10), 100m, 0m);
        await _db.SaveChangesAsync();
        Post(supplier, _day1.AddDays(-5), 60m, 0m); // inserted last, dated before the period
        await _db.SaveChangesAsync();

        var statement = await new GetSupplierStatementQueryHandler(_db, Branch(null))
            .Handle(new GetSupplierStatementQuery(supplier.Id, _day1, _day1.AddDays(30)), CancellationToken.None);

        statement.OpeningBalance.ShouldBe(60m);
        statement.ClosingBalance.ShouldBe(160m);
    }

    [Fact]
    public async Task Ap_Aging_For_One_Branch_Should_Count_A_Payment_Made_At_Another_Branch()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var supplier = await SeedSupplierAsync();
        var billA = Guid.CreateVersion7();
        Post(supplier, _day1, 100m, 0m, branchA, "DirectGoodsReceipt", billA);
        // Paid at branch B against branch A's bill.
        decimal running = supplier.ApplyLedgerEntry(0m, 100m);
        _db.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
            supplier.Id, _day1.AddDays(1), SupplierLedgerEntryType.Payment, null, 0m, 100m, running,
            "DirectGoodsReceipt", billA, branchB));
        await _db.SaveChangesAsync();

        var aging = await new GetApAgingReportQueryHandler(_db, Branch(branchA))
            .Handle(new GetApAgingReportQuery(_day1.AddDays(10), branchA), CancellationToken.None);

        aging.ShouldBeEmpty();
    }

    [Fact]
    public async Task Ap_Aging_For_One_Branch_Should_Not_Let_Another_Branchs_Bill_Absorb_Its_Credit()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var supplier = await SeedSupplierAsync();
        Post(supplier, _day1, 100m, 0m, branchA, "DirectGoodsReceipt", Guid.CreateVersion7()); // oldest
        Post(supplier, _day1.AddDays(1), 70m, 0m, branchB, "DirectGoodsReceipt", Guid.CreateVersion7());
        Post(supplier, _day1.AddDays(2), 0m, 100m, branchB);   // unallocated payment at B: settles A's older bill (FIFO)
        await _db.SaveChangesAsync();

        var agingB = await new GetApAgingReportQueryHandler(_db, Branch(branchB))
            .Handle(new GetApAgingReportQuery(_day1.AddDays(10), branchB), CancellationToken.None);
        var agingA = await new GetApAgingReportQueryHandler(_db, Branch(branchA))
            .Handle(new GetApAgingReportQuery(_day1.AddDays(10), branchA), CancellationToken.None);

        agingB.ShouldHaveSingleItem().Total.ShouldBe(70m);
        agingA.ShouldBeEmpty();
    }

    [Fact]
    public async Task Purchase_Order_Payable_Should_Be_Dated_By_The_Receipt_Date()
    {
        var supplier = await SeedSupplierAsync();
        var orderedOn = _day1;
        var receivedOn = _day1.AddDays(20);

        await new PurchaseOrderReceivedIntegrationEventHandler(_db, Substitute.For<ICurrentBranch>()).HandleAsync(
            new PurchaseOrderReceivedIntegrationEvent(
                Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Purchasing", Guid.CreateVersion7(), supplier.Id,
                100m, orderedOn, ReceivedAtUtc: receivedOn));

        (await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync()).EntryDateUtc.ShouldBe(receivedOn);
    }

    [Fact]
    public async Task Purchase_Order_Payable_From_An_Old_Event_Should_Fall_Back_To_The_Order_Date()
    {
        var supplier = await SeedSupplierAsync();

        await new PurchaseOrderReceivedIntegrationEventHandler(_db, Substitute.For<ICurrentBranch>()).HandleAsync(
            new PurchaseOrderReceivedIntegrationEvent(
                Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Purchasing", Guid.CreateVersion7(), supplier.Id, 100m, _day1));

        (await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync()).EntryDateUtc.ShouldBe(_day1);
    }
}
