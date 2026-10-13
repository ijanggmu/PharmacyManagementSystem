using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Sales.CreateSale;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Shouldly;
using Xunit;

namespace Sales.Tests.Features.Sales;

/// <summary>
/// Wholesale / custom price levels in <see cref="CreateSaleCommandHandler"/>: the server prices every lot at the
/// customer's level (pack lines included), ignores any client price, keeps VAT carved out of the VAT-inclusive price,
/// and refuses a cheaper level than the customer's own without an override.
/// </summary>
public sealed class CreateSalePriceLevelTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IStockDeductionService _stock = Substitute.For<IStockDeductionService>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ISaleControls _saleControls = Substitute.For<ISaleControls>();
    private readonly CreateSaleCommandHandler _sut;

    public CreateSalePriceLevelTests()
    {
        var currentUser = Substitute.For<ICurrentUser>();
        currentUser.GetTenant().Returns("test-tenant");
        var branch = Substitute.For<ICurrentBranch>();
        branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
        var invoiceNumbers = Substitute.For<IInvoiceNumberService>();
        invoiceNumbers.ResolveContextAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns(new InvoiceNumberContext("INV", "MAIN"));
        invoiceNumbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(1, 2, 3);
        var permissions = Substitute.For<IUserPermissionService>();
        permissions.HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);

        // 13% VAT, prices VAT-inclusive.
        _mediator.Send(Arg.Any<GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PharmacySettingsDto(Guid.CreateVersion7(), "Test Pharmacy", null, null, null, "NPR", 13m, "INV", 1, null));
        _mediator.Send(Arg.Any<GetCustomerAllergiesQuery>(), Arg.Any<CancellationToken>())
            .Returns(call => new CustomerAllergiesDto(((GetCustomerAllergiesQuery)call[0]).CustomerId, []));
        _mediator.Send(Arg.Any<GetCustomerCreditStatusQuery>(), Arg.Any<CancellationToken>())
            .Returns(call => new CustomerCreditStatusDto(((GetCustomerCreditStatusQuery)call[0]).CustomerId, "Bhandari Clinic", 0m, null));

        _sut = new CreateSaleCommandHandler(
            _db, Substitute.For<IDispensingSafetyPolicy>(), permissions, _stock, _outbox, _mediator, currentUser, branch, invoiceNumbers,
            Substitute.For<ICustomerSalePostingService>(), _saleControls, NullLogger<CreateSaleCommandHandler>.Instance);
    }

    public void Dispose() => _db.Dispose();

    private Guid StubMedicine(int? unitsPerPack = null)
    {
        var id = Guid.CreateVersion7();
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == id), Arg.Any<CancellationToken>())
            .Returns(new MedicineDto(
                Id: id, Name: "Paracetamol 500mg", GenericName: null, CategoryId: null, ReorderLevel: 0m, IsControlled: false,
                TotalQuantityOnHand: 500m, IsArchived: false, CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null, UnitPrice: 10m,
                Form: "Tablet", UnitsPerPack: unitsPerPack, UnitLabel: unitsPerPack is null ? null : "Strip"));
        return id;
    }

    /// <summary>The deduction draws the given lots (quantity, lot selling price) for one cart line.</summary>
    private void StubLots(Guid medicineId, params (decimal Quantity, decimal Price)[] lots)
    {
        var batches = lots
            .Select((l, i) => new BatchDeductionDetail(Guid.CreateVersion7(), $"B{i + 1}", l.Quantity, 5m, SellingPrice: l.Price))
            .ToList();
        _stock.DeductForSaleAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockDeductionLineResult> { new(medicineId, lots.Sum(l => l.Quantity), batches) });
    }

    private PriceLevel SeedLevel(string name, decimal percent, Guid? customerId = null, params (Guid MedicineId, decimal Price)[] explicitPrices)
    {
        var level = PriceLevel.Create(name, percent, null);
        _db.PriceLevels.Add(level);
        foreach (var (medicineId, price) in explicitPrices)
        {
            _db.PriceLevelItems.Add(PriceLevelItem.Create(level.Id, medicineId, price));
        }

        if (customerId is { } id)
        {
            _db.CustomerPriceLevels.Add(CustomerPriceLevel.Create(id, level.Id));
        }

        _db.SaveChanges();
        return level;
    }

    [Fact]
    public async Task Wholesale_Customer_Is_Charged_The_Level_Price_On_Every_Lot_With_Vat_Carved_Out()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = StubMedicine();
        var wholesale = SeedLevel("Wholesale", 10m, customerId);
        // 6 units from a Rs 11.30 lot and 4 from a Rs 12 lot: wholesale 10.17 and 10.80.
        StubLots(medicineId, (6m, 11.30m), (4m, 12m));

        var saleId = await _sut.Handle(
            new CreateSaleCommand(customerId, [new SaleItemInput(medicineId, 10m)], "Cash", 104.22m), CancellationToken.None);

        var sale = await _db.Sales.Include(s => s.Items).SingleAsync(s => s.Id == saleId);
        sale.Items.Select(i => i.UnitPrice).ShouldBe([10.17m, 10.80m]);
        sale.TotalAmount.ShouldBe(104.22m);
        // VAT-inclusive: 104.22 × 13 / 113 = 11.99.
        sale.VatAmount.ShouldBe(11.99m);
        (sale.PriceLevelId, sale.PriceLevelName).ShouldBe((wholesale.Id, "Wholesale"));
        await _saleControls.DidNotReceiveWithAnyArgs()
            .EnsurePriceLevelOverrideAllowedAsync(default, default!, default, default, default);
    }

    [Fact]
    public async Task Pack_Line_Is_Priced_As_Its_Base_Units_At_The_Level_Explicit_Price()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = StubMedicine(unitsPerPack: 10);
        SeedLevel("Hospital", 5m, customerId, (medicineId, 9.50m));
        StubLots(medicineId, (20m, 11.30m));

        var saleId = await _sut.Handle(
            new CreateSaleCommand(
                customerId, [new SaleItemInput(medicineId, 20m, SaleUnit: "pack", PackCount: 2)], "Cash", 190m),
            CancellationToken.None);

        var line = (await _db.Sales.Include(s => s.Items).SingleAsync(s => s.Id == saleId)).Items.Single();
        (line.Quantity, line.UnitPrice, line.LineTotal, line.PackQuantity).ShouldBe((20m, 9.50m, 190m, (decimal?)2m));
    }

    [Fact]
    public async Task A_Client_Sent_Unit_Price_Is_Ignored()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = StubMedicine();
        SeedLevel("Wholesale", 10m, customerId);
        StubLots(medicineId, (2m, 10m));

        // The till claims Re 1 a unit; the sale is still Rs 9 a unit, so Rs 2 does not cover it.
        var tampered = new CreateSaleCommand(customerId, [new SaleItemInput(medicineId, 2m, UnitPrice: 1m)], null, 0m,
            Payments: [new SalePaymentInput("cash", 2m)]);
        await Should.ThrowAsync<CustomException>(async () => await _sut.Handle(tampered, CancellationToken.None));
        (await _db.Sales.CountAsync()).ShouldBe(0);

        var honest = tampered with { Payments = [new SalePaymentInput("cash", 18m)] };
        var saleId = await _sut.Handle(honest, CancellationToken.None);
        (await _db.Sales.Include(s => s.Items).SingleAsync(s => s.Id == saleId)).Items.Single().UnitPrice.ShouldBe(9m);
    }

    [Fact]
    public async Task A_Cheaper_Level_Than_The_Customers_Own_Is_Refused_Without_An_Override()
    {
        var medicineId = StubMedicine();
        var wholesale = SeedLevel("Wholesale", 10m);
        StubLots(medicineId, (5m, 20m));
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        _saleControls
            .EnsurePriceLevelOverrideAllowedAsync(Arg.Any<decimal>(), Arg.Any<string>(), Arg.Any<IReadOnlyCollection<string>?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Throws(new ForbiddenException("approval_required"));
#pragma warning restore CA2012

        // A walk-in (retail) checkout that asks for wholesale prices: 5 × (20 − 18) = Rs 10 off.
        var command = new CreateSaleCommand(null, [new SaleItemInput(medicineId, 5m)], "Cash", 90m,
            ClientRequestId: "checkout-1", PriceLevelId: wholesale.Id);

        await Should.ThrowAsync<ForbiddenException>(async () => await _sut.Handle(command, CancellationToken.None));
        await _saleControls.Received(1).EnsurePriceLevelOverrideAllowedAsync(
            10m, "Wholesale", Arg.Any<IReadOnlyCollection<string>?>(), "checkout-1", Arg.Any<CancellationToken>());
        (await _db.Sales.CountAsync()).ShouldBe(0);
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }

    [Fact]
    public async Task An_Approved_Level_Override_Prices_At_The_Requested_Level()
    {
        var medicineId = StubMedicine();
        var wholesale = SeedLevel("Wholesale", 10m);
        StubLots(medicineId, (5m, 20m));

        var saleId = await _sut.Handle(
            new CreateSaleCommand(null, [new SaleItemInput(medicineId, 5m)], "Cash", 90m,
                ClientRequestId: "checkout-2", ApprovalTokens: ["token"], PriceLevelId: wholesale.Id),
            CancellationToken.None);

        var sale = await _db.Sales.SingleAsync(s => s.Id == saleId);
        sale.PriceLevelName.ShouldBe("Wholesale");
        await _saleControls.Received(1).EnsurePriceLevelOverrideAllowedAsync(
            10m, "Wholesale", Arg.Is<IReadOnlyCollection<string>?>(t => t != null && t.Contains("token")), "checkout-2", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Selling_A_Level_Customer_At_Retail_Needs_No_Approval()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = StubMedicine();
        SeedLevel("Wholesale", 10m, customerId);
        StubLots(medicineId, (1m, 20m));

        // Guid.Empty = retail explicitly: dearer than the customer's own level, so nothing to approve.
        var saleId = await _sut.Handle(
            new CreateSaleCommand(customerId, [new SaleItemInput(medicineId, 1m)], "Cash", 20m, PriceLevelId: Guid.Empty),
            CancellationToken.None);

        var sale = await _db.Sales.Include(s => s.Items).SingleAsync(s => s.Id == saleId);
        sale.Items.Single().UnitPrice.ShouldBe(20m);
        sale.PriceLevelId.ShouldBeNull();
        await _saleControls.DidNotReceiveWithAnyArgs()
            .EnsurePriceLevelOverrideAllowedAsync(default, default!, default, default, default);
    }

    [Fact]
    public async Task An_Inactive_Assigned_Level_Falls_Back_To_Retail_And_An_Unknown_Requested_Level_Is_Refused()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = StubMedicine();
        var level = SeedLevel("Wholesale", 10m, customerId);
        level.Update("Wholesale", 10m, null, isActive: false);
        await _db.SaveChangesAsync();
        StubLots(medicineId, (1m, 20m));

        var saleId = await _sut.Handle(
            new CreateSaleCommand(customerId, [new SaleItemInput(medicineId, 1m)], "Cash", 20m), CancellationToken.None);
        (await _db.Sales.Include(s => s.Items).SingleAsync(s => s.Id == saleId)).Items.Single().UnitPrice.ShouldBe(20m);

        var unknown = new CreateSaleCommand(customerId, [new SaleItemInput(medicineId, 1m)], "Cash", 18m, PriceLevelId: Guid.CreateVersion7());
        var ex = await Should.ThrowAsync<CustomException>(async () => await _sut.Handle(unknown, CancellationToken.None));
        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Sale_Completed_Event_Carries_The_Level_Priced_Total()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = StubMedicine();
        SeedLevel("Wholesale", 10m, customerId);
        StubLots(medicineId, (10m, 11.30m));

        await _sut.Handle(new CreateSaleCommand(customerId, [new SaleItemInput(medicineId, 10m)], "Cash", 101.70m), CancellationToken.None);

        // 10 × 10.17 = 101.70; VAT 101.70 × 13 / 113 = 11.70.
        await _outbox.Received(1).AddAsync(
            Arg.Is<SaleCompletedIntegrationEvent>(e => e.TotalAmount == 101.70m && e.VatAmount == 11.70m),
            Arg.Any<CancellationToken>());
    }
}
