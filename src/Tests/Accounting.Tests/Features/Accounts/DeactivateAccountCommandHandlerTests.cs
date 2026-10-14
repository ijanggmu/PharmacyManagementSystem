using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Accounts.DeactivateAccount;
using Microsoft.EntityFrameworkCore;

namespace Accounting.Tests.Features.Accounts;

/// <summary>Deactivating an account: a system account or one that still carries a balance is refused with a 409.</summary>
public sealed class DeactivateAccountCommandHandlerTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();

    public void Dispose() => _db.Dispose();

    private Task<Guid> DeactivateAsync(Guid id) =>
        new DeactivateAccountCommandHandler(_db).Handle(new DeactivateAccountCommand(id), CancellationToken.None).AsTask();

    [Fact]
    public async Task Handle_Should_Refuse_A_SystemAccount_With_Conflict()
    {
        var cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset, isSystem: true);

        var ex = await Should.ThrowAsync<CustomException>(() => DeactivateAsync(cash.Id));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await _db.Accounts.AsNoTracking().SingleAsync(a => a.Id == cash.Id)).IsActive.ShouldBeTrue();
    }

    [Fact]
    public async Task Handle_Should_Refuse_An_Account_That_Still_Has_A_Balance()
    {
        var cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset, isSystem: true);
        var rent = await AccountingTestChart.AddAsync(_db, "5200", AccountingAccountType.Expense);
        await VoucherSeed.PostedAsync(_db, DateTime.UtcNow.AddDays(-1), "JV-1", rent.Id, cash.Id, 1_500m, "journal");

        var ex = await Should.ThrowAsync<CustomException>(() => DeactivateAsync(rent.Id));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("1,500.00 Dr");
    }

    [Fact]
    public async Task Handle_Should_Deactivate_An_Account_Whose_Balance_Is_Cleared()
    {
        var cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset, isSystem: true);
        var rent = await AccountingTestChart.AddAsync(_db, "5200", AccountingAccountType.Expense);
        var unused = await AccountingTestChart.AddAsync(_db, "5300", AccountingAccountType.Expense);
        await VoucherSeed.PostedAsync(_db, DateTime.UtcNow.AddDays(-2), "JV-1", rent.Id, cash.Id, 1_500m, "journal");
        await VoucherSeed.PostedAsync(_db, DateTime.UtcNow.AddDays(-1), "JV-2", cash.Id, rent.Id, 1_500m, "journal");

        await DeactivateAsync(rent.Id);
        await DeactivateAsync(unused.Id);

        (await _db.Accounts.AsNoTracking().CountAsync(a => !a.IsActive)).ShouldBe(2);
    }
}
