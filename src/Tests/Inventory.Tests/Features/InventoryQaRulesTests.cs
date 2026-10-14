using System.Net;
using System.Security.Claims;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Constants;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Batches.CreateBatch;
using FSH.Modules.Inventory.Features.v1.Consignment.SearchConsignmentPositions;
using FSH.Modules.Inventory.Features.v1.Medicines.BulkCreateMedicines;
using FSH.Modules.Inventory.Features.v1.Medicines.DeleteMedicine;
using FSH.Modules.Inventory.Features.v1.Medicines.GetLatestLotPrices;
using FSH.Modules.Inventory.Features.v1.Reports.GetExpiredBatches;
using FSH.Modules.Inventory.Features.v1.Reports.GetReorderSuggestions;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using Mediator;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// Inventory QA rules: archiving with stock or open orders, expired receipts, the recall list, consignment positions that
/// agree with settlement, the shared reorder rule, weighted-average cost on bulk top-ups, maximum vs reorder level,
/// latest lot prices and the name stamped on documents.
/// </summary>
public sealed class InventoryQaRulesTests : IDisposable
{
    private static readonly DateOnly Future = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));

    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly ICurrentBranch _branch = Substitute.For<ICurrentBranch>();

    public InventoryQaRulesTests()
    {
        _branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _branch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
    }

    public void Dispose() => _db.Dispose();

    private Medicine AddMedicine(string name = "Paracetamol", decimal reorderLevel = 0m, decimal? maximumStock = null)
    {
        var medicine = Medicine.Create(name, null, null, reorderLevel, maximumStock: maximumStock);
        _db.Medicines.Add(medicine);
        _db.SaveChanges();
        return medicine;
    }

    private MedicineBatch AddLot(Medicine medicine, string batchNo, decimal quantity, decimal cost = 2m, DateOnly? expiry = null)
    {
        var lot = MedicineBatch.Create(medicine.Id, _branchId, batchNo, expiry ?? Future, quantity, cost, cost * 2, null);
        _db.MedicineBatches.Add(lot);
        _db.SaveChanges();
        return lot;
    }

    #region Archiving

    private static IMediator OpenOrders(int count)
    {
        var mediator = Substitute.For<IMediator>();
#pragma warning disable CA2012 // NSubstitute stub set-up, not a consumed ValueTask
        mediator.Send(Arg.Any<CountOpenPurchaseOrdersForMedicineQuery>(), Arg.Any<CancellationToken>()).Returns(count);
#pragma warning restore CA2012
        return mediator;
    }

    [Fact]
    public async Task Archive_Should_Be_Refused_While_Stock_Is_On_Hand()
    {
        var medicine = AddMedicine();
        AddLot(medicine, "B1", 12m);

        var ex = await Should.ThrowAsync<CustomException>(() => new DeleteMedicineCommandHandler(_db, OpenOrders(0))
            .Handle(new DeleteMedicineCommand(medicine.Id), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("12");
        _db.Medicines.Single(m => m.Id == medicine.Id).IsDeleted.ShouldBeFalse();
    }

    [Fact]
    public async Task Archive_Should_Be_Refused_While_An_Open_Purchase_Order_Has_The_Medicine()
    {
        var medicine = AddMedicine();

        var ex = await Should.ThrowAsync<CustomException>(() => new DeleteMedicineCommandHandler(_db, OpenOrders(2))
            .Handle(new DeleteMedicineCommand(medicine.Id), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("2 open purchase order");
    }

    [Fact]
    public async Task Archive_Should_Succeed_With_No_Stock_And_No_Open_Orders()
    {
        var medicine = AddMedicine();
        var emptied = AddLot(medicine, "B1", 3m);
        emptied.Deduct(3m);
        await _db.SaveChangesAsync();

        await new DeleteMedicineCommandHandler(_db, OpenOrders(0)).Handle(new DeleteMedicineCommand(medicine.Id), CancellationToken.None);

        _db.ChangeTracker.Clear();
        _db.Medicines.Any(m => m.Id == medicine.Id).ShouldBeFalse();
    }

    #endregion

    #region Expiry and recalls

    [Fact]
    public async Task CreateBatch_Should_Refuse_An_Expiry_In_The_Past()
    {
        var medicine = AddMedicine();
        var handler = new CreateBatchCommandHandler(_db, _branch, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>());

        var ex = await Should.ThrowAsync<CustomException>(() => handler.Handle(
            new CreateBatchCommand(medicine.Id, "OLD", DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-2)), 5m, 1m, 2m),
            CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        _db.MedicineBatches.ShouldBeEmpty();
    }

    [Fact]
    public void ReceiptRule_Should_Allow_Today_And_No_Expiry_But_Not_Yesterday()
    {
        var today = new DateOnly(2026, 10, 14);

        StockReceiptRules.EnsureNotExpired(today, today);
        StockReceiptRules.EnsureNotExpired(null, today);
        Should.Throw<CustomException>(() => StockReceiptRules.EnsureNotExpired(today.AddDays(-1), today, "Batch X"))
            .Message.ShouldStartWith("Batch X expired on 2026-10-13");
    }

    [Fact]
    public async Task ExpiredBatches_With_IsRecalled_Should_List_Every_Recalled_Lot_On_Hand()
    {
        var medicine = AddMedicine();
        var recalledFresh = AddLot(medicine, "RC-NEW", 5m);
        recalledFresh.Recall("Supplier recall", DateTime.UtcNow);
        var recalledOld = AddLot(medicine, "RC-OLD", 5m, expiry: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-5)));
        recalledOld.Recall("Supplier recall", DateTime.UtcNow);
        AddLot(medicine, "EXPIRED", 5m, expiry: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-5)));
        AddLot(medicine, "FINE", 5m);
        await _db.SaveChangesAsync();
        var handler = new GetExpiredBatchesQueryHandler(_db, TimeProvider.System, _branch);

        var recalled = await handler.Handle(new GetExpiredBatchesQuery(IsRecalled: true), CancellationToken.None);
        var all = await handler.Handle(new GetExpiredBatchesQuery(), CancellationToken.None);

        recalled.Items.Select(i => i.BatchNo).OrderBy(b => b, StringComparer.Ordinal).ShouldBe(["RC-NEW", "RC-OLD"]);
        all.Items.Select(i => i.BatchNo).OrderBy(b => b, StringComparer.Ordinal).ShouldBe(["EXPIRED", "RC-OLD"]);
    }

    #endregion

    [Fact]
    public async Task ConsignmentPositions_Should_Count_Sales_Net_Of_Returns_Not_Write_Offs()
    {
        var medicine = AddMedicine();
        var lot = AddLot(medicine, "CONS", 20m, cost: 5m);
        var supplier = Guid.CreateVersion7();
        _db.ConsignmentPositions.Add(ConsignmentPosition.Create(supplier, medicine.Id, lot.Id, "CONS", 20m, 5m, DateTime.UtcNow, _branchId));
        // Sold 6, one came back, 4 written off: 15 left on hand.
        lot.Deduct(6m);
        _db.InventoryTransactions.Add(InventoryTransaction.Create(medicine.Id, _branchId, lot.Id, InventoryTransactionType.Sale, -6m, 5m, "Sale", Guid.CreateVersion7()));
        lot.Increase(1m);
        _db.InventoryTransactions.Add(InventoryTransaction.Create(medicine.Id, _branchId, lot.Id, InventoryTransactionType.SaleReversal, 1m, 5m, "SaleReturn", Guid.CreateVersion7()));
        lot.Deduct(4m);
        _db.InventoryTransactions.Add(InventoryTransaction.Create(medicine.Id, _branchId, lot.Id, InventoryTransactionType.Adjustment, -4m, 5m));
        await _db.SaveChangesAsync();

        var page = await new SearchConsignmentPositionsQueryHandler(_db, _branch)
            .Handle(new SearchConsignmentPositionsQuery(SupplierId: supplier), CancellationToken.None);

        var position = page.Items.ShouldHaveSingleItem();
        position.QuantityRemaining.ShouldBe(11m);
        position.QuantitySold.ShouldBe(5m);
        position.QuantityRemovedOtherwise.ShouldBe(4m);
        position.AmountOwed.ShouldBe(25m);
    }

    #region Reorder, cost and limits

    [Fact]
    public async Task ReorderSuggestions_Should_Use_The_Shared_Rule_On_Sellable_Stock()
    {
        var medicine = AddMedicine("Amoxicillin", reorderLevel: 50m);
        AddLot(medicine, "OK", 10m);
        AddLot(medicine, "OLD", 100m, expiry: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-3)));
        var capped = AddMedicine("Cetirizine", reorderLevel: 50m, maximumStock: 70m);
        AddLot(capped, "OK", 10m);
        AddMedicine("Untracked");

        var suggestions = await new GetReorderSuggestionsQueryHandler(_db, _branch)
            .Handle(new GetReorderSuggestionsQuery(), CancellationToken.None);

        suggestions.Single(s => s.MedicineId == medicine.Id).SuggestedOrderQuantity.ShouldBe(90m);
        suggestions.Single(s => s.MedicineId == capped.Id).SuggestedOrderQuantity.ShouldBe(60m);
        suggestions.Count.ShouldBe(2);
    }

    [Fact]
    public async Task BulkImport_TopUp_Should_ReCost_The_Lot_At_The_Weighted_Average()
    {
        var medicine = AddMedicine();
        AddLot(medicine, "B1", 10m, cost: 2m);
        var handler = new BulkCreateMedicinesCommandHandler(_db, _branch, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>());

        await handler.Handle(
            new BulkCreateMedicinesCommand([new BulkMedicineRow("Paracetamol", BatchNo: "B1", ExpiryDate: Future, Quantity: 10m, CostPrice: 4m)]),
            CancellationToken.None);

        var lot = _db.MedicineBatches.Single();
        lot.QuantityOnHand.ShouldBe(20m);
        lot.CostPrice.ShouldBe(3m);
    }

    [Fact]
    public async Task BulkImport_Should_Refuse_Expired_Opening_Stock()
    {
        var handler = new BulkCreateMedicinesCommandHandler(_db, _branch, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>());

        await Should.ThrowAsync<CustomException>(() => handler.Handle(
            new BulkCreateMedicinesCommand([new BulkMedicineRow(
                "Paracetamol", BatchNo: "OLD", ExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)), Quantity: 1m)]),
            CancellationToken.None).AsTask());
    }

    [Fact]
    public void Medicine_Should_Refuse_A_Maximum_Below_The_Reorder_Level()
    {
        Should.Throw<CustomException>(() => Medicine.Create("X", null, null, 50m, maximumStock: 20m));
        Medicine.Create("X", null, null, 50m, maximumStock: 0m).MaximumStock.ShouldBe(0m);
        Medicine.Create("X", null, null, 50m, maximumStock: 50m).MaximumStock.ShouldBe(50m);
    }

    [Fact]
    public async Task LatestLotPrices_Should_Come_From_The_Newest_Costed_Lot()
    {
        var medicine = AddMedicine();
        AddLot(medicine, "FIRST", 1m, cost: 2m);
        await Task.Delay(5);
        AddLot(medicine, "SECOND", 1m, cost: 3.5m);
        await Task.Delay(5);
        AddLot(medicine, "FREE", 1m, cost: 0m);

        var prices = await new GetLatestLotPricesQueryHandler(_db).Handle(
            new GetLatestLotPricesQuery([medicine.Id, Guid.CreateVersion7()]), CancellationToken.None);

        var price = prices.ShouldHaveSingleItem().Value;
        price.CostPrice.ShouldBe(3.5m);
        price.SellingPrice.ShouldBe(7m);
    }

    #endregion

    [Theory]
    [InlineData("Ram Sharma", "DEMO-PHARMACY", "ram@x.np", "Ram Sharma")]
    [InlineData("DEMO-PHARMACY Admin", "DEMO-PHARMACY", "admin@x.np", "admin@x.np")]
    [InlineData(null, "Sita", "sita@x.np", "Sita")]
    public void ActorName_Should_Skip_A_Name_That_Is_Just_The_Tenant(string? fullName, string firstName, string email, string expected)
    {
        var user = Substitute.For<ICurrentUser>();
        user.GetTenant().Returns("demo-pharmacy");
        user.Name.Returns(firstName);
        user.GetUserEmail().Returns(email);
        user.GetUserClaims().Returns(fullName is null ? [] : [new Claim(ClaimConstants.Fullname, fullName)]);

        ActorName.Of(user).ShouldBe(expected);
    }
}
