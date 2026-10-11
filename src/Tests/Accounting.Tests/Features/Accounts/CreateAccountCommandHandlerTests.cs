using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Accounts.CreateAccount;
using FSH.Modules.Accounting.Features.v1.Accounts.GetNextAccountCode;
using Microsoft.EntityFrameworkCore;

namespace Accounting.Tests.Features.Accounts;

public sealed class CreateAccountCommandHandlerTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();

    private Task<Guid> CreateAsync(Guid parentId, string name) =>
        new CreateAccountCommandHandler(_db).Handle(new CreateAccountCommand(parentId, name), CancellationToken.None).AsTask();

    [Fact]
    public async Task Handle_Should_GenerateCodeFromRoot_And_InheritHead()
    {
        var assets = await AccountingTestChart.RootAsync(_db, AccountingAccountType.Asset);
        await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset, isSystem: true);
        await AccountingTestChart.AddAsync(_db, "1200", AccountingAccountType.Asset, isSystem: true);

        var id = await CreateAsync(assets.Id, "Cash & bank");

        var created = await _db.Accounts.AsNoTracking().SingleAsync(a => a.Id == id);
        created.Code.ShouldBe("1300");
        created.ParentId.ShouldBe(assets.Id);
        created.AccountType.ShouldBe(AccountingAccountType.Asset);
        created.IsSystem.ShouldBeFalse();
    }

    [Fact]
    public async Task Handle_Should_AppendSequence_UnderGroup()
    {
        var group = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);

        var first = await CreateAsync(group.Id, "Petty cash");
        var second = await CreateAsync(group.Id, "Cash in drawer");

        (await _db.Accounts.AsNoTracking().SingleAsync(a => a.Id == first)).Code.ShouldBe("130001");
        (await _db.Accounts.AsNoTracking().SingleAsync(a => a.Id == second)).Code.ShouldBe("130002");
    }

    [Fact]
    public async Task Handle_Should_Reject_SystemLedgerParent()
    {
        var cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset, isSystem: true);

        var ex = await Should.ThrowAsync<CustomException>(() => CreateAsync(cash.Id, "Petty cash"));

        ex.Message.ShouldContain("automatic postings");
    }

    [Fact]
    public async Task Handle_Should_Reject_ParentWithPostings()
    {
        var leaf = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, "x");
        voucher.AddLine(leaf.Id, "debit", 10m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), "credit", 0m, 10m);
        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => CreateAsync(leaf.Id, "Sub"));

        ex.Message.ShouldContain("voucher entries");
    }

    [Fact]
    public async Task Handle_Should_Throw_When_ParentMissing()
    {
        await Should.ThrowAsync<NotFoundException>(() => CreateAsync(Guid.CreateVersion7(), "Orphan"));
    }

    [Fact]
    public async Task NextCode_Should_PreviewWithoutReserving()
    {
        var group = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        var handler = new GetNextAccountCodeQueryHandler(_db);

        (await handler.Handle(new GetNextAccountCodeQuery(group.Id), CancellationToken.None)).ShouldBe("130001");
        (await handler.Handle(new GetNextAccountCodeQuery(group.Id), CancellationToken.None)).ShouldBe("130001");
    }

    [Fact]
    public void Validator_Should_Require_ParentAndName()
    {
        var result = new CreateAccountCommandValidator().Validate(new CreateAccountCommand(Guid.Empty, ""));

        result.Errors.Select(e => e.PropertyName).ShouldBe(["ParentId", "Name"], ignoreOrder: true);
    }

    public void Dispose() => _db.Dispose();
}
