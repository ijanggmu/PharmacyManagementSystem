using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.ExpiryClaims.AcceptExpiryClaim;
using FSH.Modules.Suppliers.Features.v1.ExpiryClaims.ChangeExpiryClaimStatus;
using FSH.Modules.Suppliers.Features.v1.ExpiryClaims.CreateExpiryClaim;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>Expiry claims: drafted from a supplier's lots, accepted (in part) into an ordinary debit note.</summary>
public sealed class ExpiryClaimTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ICurrentBranch _branch = Substitute.For<ICurrentBranch>();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly List<BatchSourceDto> _lots = [];
    private readonly Dictionary<Guid, Guid> _supplierByBatch = [];
    private readonly Guid _returnId = Guid.CreateVersion7();
    private CreateSupplierReturnCommand? _sentReturn;

    public ExpiryClaimTests()
    {
        _branch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);

        _mediator.Send(Arg.Any<GetBatchSourcesQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => (IReadOnlyList<BatchSourceDto>)_lots
                .Where(l => ci.Arg<GetBatchSourcesQuery>().BatchIds.Contains(l.BatchId)).ToList());
        _mediator.Send(Arg.Any<GetLotSuppliersQuery>(), Arg.Any<CancellationToken>())
            .Returns(_ => new LotSuppliersDto(new Dictionary<Guid, Guid>(_supplierByBatch), new Dictionary<Guid, Guid>()));
        _mediator.Send(Arg.Any<CreateSupplierReturnCommand>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                _sentReturn = ci.Arg<CreateSupplierReturnCommand>();
                return _returnId;
            });
    }

    public void Dispose() => _db.Dispose();

    #region Domain

    [Fact]
    public void Accept_Should_Allow_Partial_Acceptance_And_Default_Unanswered_Lines_To_Full()
    {
        var claim = ExpiryClaim.Create(Guid.CreateVersion7(), _branchId, null, DateTime.UtcNow);
        var a = claim.AddLine(Guid.CreateVersion7(), "A", Guid.CreateVersion7(), "A1", new DateOnly(2026, 11, 1), 10m, 2m);
        var b = claim.AddLine(Guid.CreateVersion7(), "B", Guid.CreateVersion7(), "B1", new DateOnly(2026, 11, 1), 4m, 5m);
        claim.MarkSent(DateTime.UtcNow);

        claim.Accept(new Dictionary<Guid, decimal> { [a.Id] = 6m }, DateTime.UtcNow);

        claim.Status.ShouldBe(ExpiryClaimStatus.Accepted);
        a.AcceptedQuantity.ShouldBe(6m);
        b.AcceptedQuantity.ShouldBe(4m);
        claim.ClaimedValue.ShouldBe(40m);
        claim.AcceptedValue.ShouldBe(32m);
    }

    [Fact]
    public void Accept_Should_Refuse_When_Nothing_Is_Accepted_Or_More_Than_Claimed()
    {
        var claim = ExpiryClaim.Create(Guid.CreateVersion7(), _branchId, null, DateTime.UtcNow);
        var a = claim.AddLine(Guid.CreateVersion7(), "A", Guid.CreateVersion7(), "A1", new DateOnly(2026, 11, 1), 10m, 2m);
        claim.MarkSent(DateTime.UtcNow);

        Should.Throw<CustomException>(() => claim.Accept(new Dictionary<Guid, decimal> { [a.Id] = 11m }, DateTime.UtcNow));
        Should.Throw<CustomException>(() => claim.Accept(new Dictionary<Guid, decimal> { [a.Id] = 0m }, DateTime.UtcNow));
    }

    [Fact]
    public void Status_Flow_Should_Only_Allow_Credit_After_Acceptance()
    {
        var claim = ExpiryClaim.Create(Guid.CreateVersion7(), _branchId, null, DateTime.UtcNow);
        claim.AddLine(Guid.CreateVersion7(), "A", Guid.CreateVersion7(), "A1", new DateOnly(2026, 11, 1), 1m, 2m);

        Should.Throw<CustomException>(() => claim.MarkCredited("CN-1", DateTime.UtcNow));
        claim.MarkSent(DateTime.UtcNow);
        claim.Reject("Past the return window", DateTime.UtcNow);
        claim.Status.ShouldBe(ExpiryClaimStatus.Rejected);
        Should.Throw<CustomException>(() => claim.MarkSent(DateTime.UtcNow));
    }

    #endregion

    #region Handlers

    [Fact]
    public async Task Create_Should_Snapshot_Lot_Cost_And_Refuse_A_Lot_Another_Supplier_Delivered()
    {
        var supplier = await SeedSupplierAsync();
        var other = await SeedSupplierAsync("Other");
        var ours = AddLot("OURS", onHand: 10m, cost: 3m, deliveredBy: supplier.Id);
        var theirs = AddLot("THEIRS", onHand: 10m, cost: 3m, deliveredBy: other.Id);
        var handler = new CreateExpiryClaimCommandHandler(_db, _mediator, _branch);

        Guid claimId = await handler.Handle(
            new CreateExpiryClaimCommand(supplier.Id, [new ExpiryClaimLineInput(ours.BatchId, 4m)]), CancellationToken.None);

        var line = (await _db.ExpiryClaims.Include(c => c.Lines).SingleAsync(c => c.Id == claimId)).Lines.ShouldHaveSingleItem();
        line.UnitCost.ShouldBe(3m);
        line.Quantity.ShouldBe(4m);

        var ex = await Should.ThrowAsync<CustomException>(() => handler.Handle(
            new CreateExpiryClaimCommand(supplier.Id, [new ExpiryClaimLineInput(theirs.BatchId, 1m)]), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Create_Should_Not_Claim_Units_Already_On_An_Open_Claim()
    {
        var supplier = await SeedSupplierAsync();
        var lot = AddLot("L1", onHand: 10m, cost: 3m, deliveredBy: supplier.Id);
        var handler = new CreateExpiryClaimCommandHandler(_db, _mediator, _branch);
        await handler.Handle(new CreateExpiryClaimCommand(supplier.Id, [new ExpiryClaimLineInput(lot.BatchId, 7m)]), CancellationToken.None);

        await Should.ThrowAsync<CustomException>(() => handler.Handle(
            new CreateExpiryClaimCommand(supplier.Id, [new ExpiryClaimLineInput(lot.BatchId, 4m)]), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Create_Should_Refuse_Consigned_Lots()
    {
        var supplier = await SeedSupplierAsync();
        var lot = AddLot("C1", onHand: 10m, cost: 3m, deliveredBy: supplier.Id, consigned: true);

        await Should.ThrowAsync<CustomException>(() => new CreateExpiryClaimCommandHandler(_db, _mediator, _branch).Handle(
            new CreateExpiryClaimCommand(supplier.Id, [new ExpiryClaimLineInput(lot.BatchId, 1m)]), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Accept_Should_Raise_A_Debit_Note_For_The_Accepted_Units_Only()
    {
        var supplier = await SeedSupplierAsync();
        var a = AddLot("A1", onHand: 10m, cost: 3m, deliveredBy: supplier.Id);
        var b = AddLot("B1", onHand: 5m, cost: 8m, deliveredBy: supplier.Id);
        Guid claimId = await new CreateExpiryClaimCommandHandler(_db, _mediator, _branch).Handle(
            new CreateExpiryClaimCommand(supplier.Id, [new ExpiryClaimLineInput(a.BatchId, 10m), new ExpiryClaimLineInput(b.BatchId, 5m)]),
            CancellationToken.None);
        await new ChangeExpiryClaimStatusCommandHandler(_db, _branch)
            .Handle(new ChangeExpiryClaimStatusCommand(claimId, ExpiryClaimAction.MarkSent), CancellationToken.None);
        var lines = (await _db.ExpiryClaims.Include(c => c.Lines).AsNoTracking().SingleAsync(c => c.Id == claimId)).Lines;

        Guid returnId = await new AcceptExpiryClaimCommandHandler(_db, _mediator, _branch).Handle(
            new AcceptExpiryClaimCommand(
                claimId,
                [new ExpiryClaimAcceptanceInput(lines.Single(l => l.BatchId == a.BatchId).Id, 6m),
                 new ExpiryClaimAcceptanceInput(lines.Single(l => l.BatchId == b.BatchId).Id, 0m)],
                new DateTime(2026, 10, 12, 0, 0, 0, DateTimeKind.Utc), "BILL-9"),
            CancellationToken.None);

        returnId.ShouldBe(_returnId);
        _sentReturn.ShouldNotBeNull();
        _sentReturn.SupplierId.ShouldBe(supplier.Id);
        _sentReturn.SupplierInvoiceNumber.ShouldBe("BILL-9");
        var item = _sentReturn.Items.ShouldHaveSingleItem();
        item.BatchId.ShouldBe(a.BatchId);
        item.Quantity.ShouldBe(6m);
        item.ReturnReason.ShouldBe(ExpiryClaim.ReturnReason);

        var saved = await _db.ExpiryClaims.Include(c => c.Lines).AsNoTracking().SingleAsync(c => c.Id == claimId);
        saved.Status.ShouldBe(ExpiryClaimStatus.Accepted);
        saved.SupplierReturnId.ShouldBe(_returnId);
        saved.AcceptedValue.ShouldBe(18m);
    }

    [Fact]
    public async Task Accept_Should_Require_The_Claim_To_Be_Sent()
    {
        var supplier = await SeedSupplierAsync();
        var a = AddLot("A1", onHand: 10m, cost: 3m, deliveredBy: supplier.Id);
        Guid claimId = await new CreateExpiryClaimCommandHandler(_db, _mediator, _branch).Handle(
            new CreateExpiryClaimCommand(supplier.Id, [new ExpiryClaimLineInput(a.BatchId, 10m)]), CancellationToken.None);

        await Should.ThrowAsync<CustomException>(() => new AcceptExpiryClaimCommandHandler(_db, _mediator, _branch).Handle(
            new AcceptExpiryClaimCommand(claimId, null, DateTime.UtcNow), CancellationToken.None).AsTask());
        _sentReturn.ShouldBeNull();
    }

    #endregion

    private async Task<Supplier> SeedSupplierAsync(string name = "Acme Pharma")
    {
        var supplier = Supplier.Create(name, null, null, null, null, null, 0m);
        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        return supplier;
    }

    private BatchSourceDto AddLot(string batchNo, decimal onHand, decimal cost, Guid deliveredBy, bool consigned = false)
    {
        var lot = new BatchSourceDto(
            Guid.CreateVersion7(), Guid.CreateVersion7(), "Cetamol 500mg", batchNo, new DateOnly(2026, 11, 30), onHand, cost,
            _branchId, IsDisposed: false, IsConsigned: consigned, PreferredSupplierId: null, ReceiptReferenceIds: []);
        _lots.Add(lot);
        _supplierByBatch[lot.BatchId] = deliveredBy;
        return lot;
    }
}
