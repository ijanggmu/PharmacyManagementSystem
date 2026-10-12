using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>Voiding in an open period is unchanged. (A closed period is covered against Postgres in
/// Integration.Tests: VoidInClosedPeriodPostgresTests, since voucher numbering needs a relational database.)</summary>
public sealed class VoidInClosedPeriodTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();

    private VoucherPostingService CreateSut() => new(
        _db, new AccountingVoucherSequenceService(_db), new AccountingPostingLockService(_db),
        Substitute.For<ICurrentBranch>(), Substitute.For<IBranchService>());

    [Fact]
    public async Task A_Voucher_In_An_Open_Period_Should_Still_Be_Voided()
    {
        var original = await VoucherSeed.PostedAsync(_db, DateTime.UtcNow, "SV-000002", Guid.CreateVersion7(), Guid.CreateVersion7(), 500m);

        await CreateSut().VoidAsync(original.Id, "Sale cancelled");

        _db.Vouchers.Single(v => v.Id == original.Id).Status.ShouldBe(AccountingVoucherStatus.Void);
        _db.Vouchers.Any(v => v.ReversesVoucherId == original.Id).ShouldBeFalse();
    }

    public void Dispose() => _db.Dispose();
}
