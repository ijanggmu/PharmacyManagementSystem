using FSH.Modules.Suppliers.Domain;

namespace Suppliers.Tests.Domain;

public sealed class SupplierLedgerEntryTests
{
    [Fact]
    public void Create_Should_StampFieldsAndTrimDescription()
    {
        var supplierId = Guid.CreateVersion7();
        var referenceId = Guid.CreateVersion7();
        var branchId = Guid.CreateVersion7();

        var entry = SupplierLedgerEntry.Create(
            supplierId, DateTime.UtcNow, SupplierLedgerEntryType.Purchase, "  received  ",
            debitAmount: 100m, creditAmount: 0m, runningBalance: 100m, referenceType: "PurchaseOrder",
            referenceId: referenceId, branchId: branchId);

        entry.SupplierId.ShouldBe(supplierId);
        entry.EntryType.ShouldBe(SupplierLedgerEntryType.Purchase);
        entry.Description.ShouldBe("received");
        entry.DebitAmount.ShouldBe(100m);
        entry.RunningBalance.ShouldBe(100m);
        entry.ReferenceType.ShouldBe("PurchaseOrder");
        entry.ReferenceId.ShouldBe(referenceId);
        entry.BranchId.ShouldBe(branchId);
        entry.Id.ShouldNotBe(Guid.Empty);
    }

    [Fact]
    public void Create_Should_PersistNullBranchId_When_NotProvided()
    {
        var entry = SupplierLedgerEntry.Create(
            Guid.CreateVersion7(), DateTime.UtcNow, SupplierLedgerEntryType.Payment, null,
            debitAmount: 0m, creditAmount: 50m, runningBalance: -50m);

        entry.BranchId.ShouldBeNull();
    }
}
