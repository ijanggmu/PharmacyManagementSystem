using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Features.v1.Suppliers.CreateSupplier;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

public sealed class CreateSupplierCommandHandlerTests
{
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly SuppliersDbContext _dbContext;
    private readonly CreateSupplierCommandHandler _sut;

    public CreateSupplierCommandHandlerTests()
    {
        _dbContext = SuppliersDbContextFactory.Create();
        _sut = new CreateSupplierCommandHandler(_dbContext, _currentBranch);
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
}
