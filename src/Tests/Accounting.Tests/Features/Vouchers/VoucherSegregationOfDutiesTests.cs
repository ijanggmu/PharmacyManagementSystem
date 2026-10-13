using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Vouchers.PostVoucher;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.Controls;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>
/// Segregation of duties on manual vouchers (tenant setting controls.voucher_creator_cannot_post, off by default):
/// when on, whoever drafted or last edited a manual voucher can't post it; someone else holding Post must.
/// </summary>
public sealed class VoucherSegregationOfDutiesTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly Guid _clerk = Guid.CreateVersion7();
    private readonly Guid _accountant = Guid.CreateVersion7();

    public VoucherSegregationOfDutiesTests()
    {
        _currentUser.Name.Returns("poster");
    }

    public void Dispose() => _db.Dispose();

    private void SegregationOn(bool on)
    {
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        _mediator.Send(Arg.Any<GetTenantSettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new Dictionary<string, string> { [InternalControlSettings.VoucherCreatorCannotPostKey] = on ? "true" : "false" });
#pragma warning restore CA2012
    }

    private async Task<AccountingVoucher> DraftByAsync(Guid createdBy, Guid? editedBy = null, AccountingVoucherSource source = AccountingVoucherSource.Manual)
    {
        var cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        var expense = await AccountingTestChart.AddAsync(_db, "5100", AccountingAccountType.Expense);
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", source, "draft");
        voucher.AddLine(expense.Id, null, 100m, 0m);
        voucher.AddLine(cash.Id, null, 0m, 100m);
        _db.Vouchers.Add(voucher);
        // What AuditableEntitySaveChangesInterceptor stamps in the app (the test context has no interceptor).
        _db.Entry(voucher).Property(v => v.CreatedBy).CurrentValue = createdBy.ToString();
        _db.Entry(voucher).Property(v => v.LastModifiedBy).CurrentValue = editedBy?.ToString();
        await _db.SaveChangesAsync();
        return voucher;
    }

    private Task<Guid> PostAsAsync(Guid userId, Guid voucherId)
    {
        _currentUser.GetUserId().Returns(userId);
        var sut = new PostVoucherCommandHandler(
            _db, new AccountingVoucherSequenceService(_db), new AccountingPostingLockService(_db), _currentUser, _currentBranch, _mediator);
        return sut.Handle(new PostVoucherCommand(voucherId), CancellationToken.None).AsTask();
    }

    /// <summary>
    /// Posting gets past the segregation check. (The voucher number is then reserved with a Postgres-only statement,
    /// which the InMemory provider refuses — anything but the 403 means the rule let the poster through.)
    /// </summary>
    private async Task PassesSegregationAsync(Guid userId, Guid voucherId)
    {
        var ex = await Record.ExceptionAsync(() => PostAsAsync(userId, voucherId));
        ex.ShouldNotBeOfType<ForbiddenException>();
    }

    [Fact]
    public async Task Creator_Should_Not_Post_Own_Manual_Voucher_When_Segregation_Is_On()
    {
        SegregationOn(true);
        var voucher = await DraftByAsync(_clerk);

        var ex = await Should.ThrowAsync<ForbiddenException>(() => PostAsAsync(_clerk, voucher.Id));

        ex.Message.ShouldContain("Segregation of duties");
        (await _db.Vouchers.AsNoTracking().SingleAsync()).Status.ShouldBe(AccountingVoucherStatus.Draft);
    }

    [Fact]
    public async Task Last_Editor_Should_Not_Post_When_Segregation_Is_On()
    {
        SegregationOn(true);
        var voucher = await DraftByAsync(_clerk, editedBy: _accountant);

        await Should.ThrowAsync<ForbiddenException>(() => PostAsAsync(_accountant, voucher.Id));
    }

    [Fact]
    public async Task Someone_Else_Should_Post_When_Segregation_Is_On()
    {
        SegregationOn(true);
        var voucher = await DraftByAsync(_clerk);

        await PassesSegregationAsync(_accountant, voucher.Id);

    }

    [Fact]
    public async Task Creator_Should_Post_Own_Voucher_When_Segregation_Is_Off()
    {
        SegregationOn(false);
        var voucher = await DraftByAsync(_clerk);

        await PassesSegregationAsync(_clerk, voucher.Id);

    }

    [Fact]
    public void Segregation_Should_Be_Off_By_Default()
    {
        InternalControlSettings.From(new Dictionary<string, string>()).VoucherCreatorCannotPost.ShouldBeFalse();
        InternalControlSettings.Default.VoucherCreatorCannotPost.ShouldBeFalse();
    }
}
