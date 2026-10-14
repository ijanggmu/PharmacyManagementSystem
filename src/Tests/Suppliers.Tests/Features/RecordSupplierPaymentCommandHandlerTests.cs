using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

public sealed class RecordSupplierPaymentCommandHandlerTests
{
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly SuppliersDbContext _dbContext;
    private readonly RecordSupplierPaymentCommandHandler _sut;

    public RecordSupplierPaymentCommandHandlerTests()
    {
        _dbContext = SuppliersDbContextFactory.Create();
        _sut = new RecordSupplierPaymentCommandHandler(_dbContext, _outbox, _currentUser, _currentBranch, Substitute.For<FSH.Modules.Suppliers.Services.ISupplierPaymentNumberService>(), Substitute.For<Mediator.IMediator>());
    }

    [Fact]
    public async Task Handle_Should_StampBranchId_From_ICurrentBranch()
    {
        var supplier = Supplier.Create("Acme", null, null, null, null, null, 100m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();

        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        _currentUser.GetTenant().Returns("test-tenant");

        var entryId = await _sut.Handle(
            new RecordSupplierPaymentCommand(supplier.Id, 40m, DateTime.UtcNow, "Payment"), CancellationToken.None);

        var entry = await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync(e => e.Id == entryId);
        entry.BranchId.ShouldBe(branchId);
        entry.EntryType.ShouldBe(SupplierLedgerEntryType.Payment);
    }

    [Fact]
    public async Task Handle_Should_PersistNullBranchId_When_ICurrentBranchReturnsNull()
    {
        var supplier = Supplier.Create("Acme", null, null, null, null, null, 100m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();

        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        _currentUser.GetTenant().Returns("test-tenant");

        var entryId = await _sut.Handle(
            new RecordSupplierPaymentCommand(supplier.Id, 10m, DateTime.UtcNow, null), CancellationToken.None);

        var entry = await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync(e => e.Id == entryId);
        entry.BranchId.ShouldBeNull();
    }

    [Theory]
    [InlineData("cheque", "cheque")]
    [InlineData(" Bank ", "Bank")]
    [InlineData(null, null)]
    public async Task Handle_Should_CarryPaymentMethod_OnTheEvent(string? method, string? expected)
    {
        var supplier = Supplier.Create("Acme", null, null, null, null, null, 100m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);

        await _sut.Handle(new RecordSupplierPaymentCommand(supplier.Id, 40m, DateTime.UtcNow, null, method), CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<FSH.Modules.Suppliers.Contracts.Events.SupplierPaymentRecordedIntegrationEvent>(e => e.PaymentMethod == expected),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public void Validator_Should_Reject_A_Future_Missing_Or_Unsupported_Payment_Date()
    {
        var validator = new RecordSupplierPaymentCommandValidator();
        var supplierId = Guid.CreateVersion7();

        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 10m, DateTime.UtcNow.AddDays(3))).IsValid.ShouldBeFalse();
        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 10m, default)).IsValid.ShouldBeFalse();
        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 10m, new DateTime(2040, 1, 1, 0, 0, 0, DateTimeKind.Utc))).IsValid.ShouldBeFalse();
        validator.Validate(new RecordSupplierPaymentCommand(supplierId, 10m, DateTime.UtcNow.AddHours(20))).IsValid.ShouldBeTrue();
    }
}
