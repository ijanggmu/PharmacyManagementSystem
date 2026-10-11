using FSH.Modules.Customers.Domain;

namespace Customers.Tests.Domain;

public sealed class CustomerLedgerEntryTests
{
    [Fact]
    public void Create_Should_StampFieldsAndTrimDescription()
    {
        var customerId = Guid.CreateVersion7();
        var saleId = Guid.CreateVersion7();

        var entry = CustomerLedgerEntry.Create(
            customerId, DateTime.UtcNow, CustomerLedgerEntryType.Sale, "  on account  ",
            debitAmount: 30m, creditAmount: 0m, runningBalance: 30m, referenceType: "Sale", referenceId: saleId);

        entry.CustomerId.ShouldBe(customerId);
        entry.EntryType.ShouldBe(CustomerLedgerEntryType.Sale);
        entry.Description.ShouldBe("on account");
        entry.DebitAmount.ShouldBe(30m);
        entry.RunningBalance.ShouldBe(30m);
        entry.ReferenceType.ShouldBe("Sale");
        entry.ReferenceId.ShouldBe(saleId);
        entry.BranchId.ShouldBeNull();
    }

    [Fact]
    public void Create_Should_SetBranchId_When_Provided()
    {
        var branchId = Guid.CreateVersion7();

        var entry = CustomerLedgerEntry.Create(
            Guid.CreateVersion7(), DateTime.UtcNow, CustomerLedgerEntryType.Payment, null,
            debitAmount: 0m, creditAmount: 30m, runningBalance: 0m, branchId: branchId);

        entry.BranchId.ShouldBe(branchId);
    }
}
