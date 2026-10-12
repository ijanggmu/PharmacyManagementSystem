using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Features.v1.Suppliers.CreateSupplier;
using FSH.Modules.Suppliers.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

public sealed class CreateSupplierCommandHandlerTests
{
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ISupplierLedgerPermissionGuard _ledgerPermissions = Substitute.For<ISupplierLedgerPermissionGuard>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly SuppliersDbContext _dbContext;
    private readonly CreateSupplierCommandHandler _sut;

    public CreateSupplierCommandHandlerTests()
    {
        _dbContext = SuppliersDbContextFactory.Create();
        _sut = new CreateSupplierCommandHandler(
            _dbContext, _currentBranch, _ledgerPermissions, _outbox, Substitute.For<ICurrentUser>());
    }

    [Fact]
    public async Task Handle_Should_StampBranchId_OnOpeningBalanceEntry()
    {
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        var supplierId = await _sut.Handle(
            new CreateSupplierCommand("Acme Pharma", OpeningBalance: 500m), CancellationToken.None);

        var entry = await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync(e => e.SupplierId == supplierId);
        entry.BranchId.ShouldBe(branchId);
    }

    [Fact]
    public async Task Handle_Should_Not_Call_ICurrentBranch_When_NoOpeningBalance()
    {
        await _sut.Handle(new CreateSupplierCommand("Acme Pharma"), CancellationToken.None);

        await _currentBranch.DidNotReceive().GetBranchIdAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Reject_A_Duplicate_Name_Ignoring_Case_And_Spaces()
    {
        await _sut.Handle(new CreateSupplierCommand("Acme Pharma"), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(
            () => _sut.Handle(new CreateSupplierCommand("  acme PHARMA "), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await _dbContext.Suppliers.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Handle_Should_Raise_The_Opening_Balance_Event_For_The_Gl()
    {
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        var supplierId = await _sut.Handle(
            new CreateSupplierCommand("Acme Pharma", OpeningBalance: -250m), CancellationToken.None);

        var entry = await _dbContext.SupplierLedgerEntries.AsNoTracking().SingleAsync(e => e.SupplierId == supplierId);
        await _outbox.Received(1).AddAsync(
            Arg.Is<SupplierOpeningBalanceRecordedIntegrationEvent>(e =>
                e.SupplierId == supplierId && e.Amount == -250m && e.LedgerEntryId == entry.Id
                && e.BranchId == branchId && e.VoucherDateUtc == entry.EntryDateUtc && e.SupplierName == "Acme Pharma"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Not_Raise_An_Event_Or_Check_The_Permission_Without_An_Opening_Balance()
    {
        await _sut.Handle(new CreateSupplierCommand("Acme Pharma"), CancellationToken.None);

        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
        await _ledgerPermissions.DidNotReceiveWithAnyArgs().EnsureCanManageOpeningBalanceAsync(default);
    }

    [Fact]
    public async Task Handle_Should_Refuse_An_Opening_Balance_Without_The_Permission()
    {
        _ledgerPermissions.EnsureCanManageOpeningBalanceAsync(Arg.Any<CancellationToken>())
            .Returns<Task>(_ => throw new CustomException("no", (IEnumerable<string>?)null, HttpStatusCode.Forbidden));

        var ex = await Should.ThrowAsync<CustomException>(
            () => _sut.Handle(new CreateSupplierCommand("Acme Pharma", OpeningBalance: 100m), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await _dbContext.Suppliers.CountAsync()).ShouldBe(0);
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }

    [Theory]
    [InlineData(10.005)]
    [InlineData(-0.001)]
    public void Validator_Should_Reject_Sub_Paisa_Opening_Balance(double amount)
    {
        var result = new CreateSupplierCommandValidator().Validate(new CreateSupplierCommand("Acme", OpeningBalance: (decimal)amount));

        result.IsValid.ShouldBeFalse();
    }
}
