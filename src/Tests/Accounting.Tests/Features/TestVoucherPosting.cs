using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Accounting.Tests.Features;

/// <summary>A real <see cref="VoucherPostingService"/> over a test context, with an in-memory voucher counter.</summary>
internal static class TestVoucherPosting
{
    public static VoucherPostingService Create(AccountingDbContext db, ICurrentBranch? currentBranch = null, IBranchService? branchService = null)
    {
        int next = 0;
        var numbers = Substitute.For<IAccountingVoucherNumbers>();
        numbers.ReserveNextNumberAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(_ => Task.FromResult(++next));
        return new VoucherPostingService(
            db, numbers, new AccountingPostingLockService(db),
            currentBranch ?? Substitute.For<ICurrentBranch>(),
            branchService ?? Substitute.For<IBranchService>(),
            NullLogger<VoucherPostingService>.Instance);
    }
}
