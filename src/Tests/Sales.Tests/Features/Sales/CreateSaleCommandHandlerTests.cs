using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Contracts.Safety;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Sales.CreateSale;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Sales.Tests.Features.Sales;

/// <summary>
/// Exercises <see cref="CreateSaleCommandHandler"/>'s branch resolution — a sale is REQUIRED to
/// carry a <c>BranchId</c> (branch-scoping-plan.md §2), resolved via
/// <c>ICurrentBranch.RequireBranchIdAsync</c>. This is the first handler test in Sales.Tests that
/// needs an <c>ICurrentBranch</c> fake; the pattern (a plain NSubstitute stub returning a fixed
/// branch id from <c>RequireBranchIdAsync</c>) is mirrored by
/// <c>CreateReturnCommandHandlerTests</c>/<c>CreateRefundCommandHandlerTests</c>.
/// </summary>
public sealed class CreateSaleCommandHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IDispensingSafetyPolicy _dispensingSafetyPolicy = Substitute.For<IDispensingSafetyPolicy>();
    private readonly IUserPermissionService _userPermissions = Substitute.For<IUserPermissionService>();
    private readonly IStockDeductionService _stockDeductionService = Substitute.For<IStockDeductionService>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IInvoiceNumberService _invoiceNumbers = Substitute.For<IInvoiceNumberService>();
    private readonly ICustomerSalePostingService _customerPosting = Substitute.For<ICustomerSalePostingService>();
    private readonly ISaleControls _saleControls = Substitute.For<ISaleControls>();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly CreateSaleCommandHandler _sut;

    public CreateSaleCommandHandlerTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _invoiceNumbers.ResolveContextAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(new InvoiceNumberContext("INV", "MAIN"));
        _invoiceNumbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(1, 2, 3);
        _userPermissions.HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(true);
        _mediator.Send(Arg.Any<GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PharmacySettingsDto(Guid.CreateVersion7(), "Test Pharmacy", null, null, null, "NPR", 0m, "INV", 1, null));
        // The handler loads every cart line's medicine through GetMedicineByIdQuery before any safety check.
        _mediator.Send(Arg.Any<GetMedicineByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns(new MedicineDto(
                Id: Guid.CreateVersion7(), Name: "Test Medicine", GenericName: null, CategoryId: null,
                ReorderLevel: 0m, IsControlled: false, TotalQuantityOnHand: 100m, IsArchived: false,
                CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null, UnitPrice: 10m));
        // No batch on hand, so the catalog unit price stands (FEFO batch override does not apply).
        _mediator.Send(Arg.Any<SearchBatchesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResponse<MedicineBatchDto>
            {
                Items = [],
                PageNumber = 1,
                PageSize = 50,
                TotalCount = 0,
                TotalPages = 1,
            });

        _sut = new CreateSaleCommandHandler(
            _db, _dispensingSafetyPolicy, _userPermissions, _stockDeductionService, _outbox, _mediator, _currentUser, _currentBranch, _invoiceNumbers, _customerPosting, _saleControls, NullLogger<CreateSaleCommandHandler>.Instance);
    }

    private void StubDeductionFor(Guid medicineId, decimal quantity, decimal unitCostPrice)
    {
        // Priced at 10, the batch price the sale charges (the medicine's catalog price is not used).
        var batch = new BatchDeductionDetail(Guid.CreateVersion7(), "BATCH-1", quantity, unitCostPrice, SellingPrice: 10m);
        var result = new StockDeductionLineResult(medicineId, quantity, [batch]);
        _stockDeductionService
            .DeductForSaleAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockDeductionLineResult> { result });
    }

    [Fact]
    public async Task Handle_Should_StampResolvedBranchId_OnSale_And_ItsItems()
    {
        // Arrange
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 2m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 20m);

        // Act
        var saleId = await _sut.Handle(command, CancellationToken.None);

        // Assert
        var saved = await _db.Sales.Include(s => s.Items).FirstAsync(s => s.Id == saleId);
        saved.BranchId.ShouldBe(_branchId);
        saved.Items[0].BranchId.ShouldBe(_branchId);
        await _outbox.Received(1).AddAsync(Arg.Any<SaleCompletedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Reject_Before_Stock_Is_Touched_When_DispensingSafetyFails()
    {
        // Arrange
        var medicineId = Guid.CreateVersion7();
        var sut = new CreateSaleCommandHandler(
            _db, new RejectingDispensingSafetyPolicy(), _userPermissions, _stockDeductionService, _outbox, _mediator, _currentUser, _currentBranch, _invoiceNumbers, _customerPosting, _saleControls, NullLogger<CreateSaleCommandHandler>.Instance);
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 1m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 10m);

        // Act
        var act = async () => await sut.Handle(command, CancellationToken.None);

        // Assert
        await Should.ThrowAsync<DispensingSafetyException>(act);
        await _stockDeductionService.DidNotReceiveWithAnyArgs()
            .DeductForSaleAsync(default!, default);
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
        (await _db.Sales.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_Issue_Sequential_InvoiceNumber_For_Branch_And_FiscalYear()
    {
        // Arrange
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 1m, unitCostPrice: 5m);
        var command = new CreateSaleCommand(
            CustomerId: null, Items: [new SaleItemInput(medicineId, 1m, 10m, 0m)], PaymentMethod: "Cash", PaymentAmount: 10m);

        // Act
        var saleId = await _sut.Handle(command, CancellationToken.None);

        // Assert
        var saved = await _db.Sales.FirstAsync(s => s.Id == saleId);
        int fiscalYear = NepalFiscalYear.StartYearFor(saved.SaleDateUtc);
        saved.FiscalYear.ShouldBe(fiscalYear);
        saved.InvoiceNumber.ShouldBe($"INV-MAIN-{NepalFiscalYear.Label(fiscalYear)}-00001");
        await _invoiceNumbers.Received(1).ReserveNextAsync(_branchId, fiscalYear, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Carve_Vat_Only_Out_Of_Taxable_Lines()
    {
        // Arrange: 13% VAT; one taxable medicine (Rs 113) and one VAT-exempt medicine (Rs 50).
        var taxableId = Guid.CreateVersion7();
        var exemptId = Guid.CreateVersion7();
        _mediator.Send(Arg.Any<GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PharmacySettingsDto(Guid.CreateVersion7(), "Test Pharmacy", null, null, null, "NPR", 13m, "INV", 1, null));
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == taxableId), Arg.Any<CancellationToken>())
            .Returns(Medicine(taxableId, unitPrice: 113m, isTaxable: true));
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == exemptId), Arg.Any<CancellationToken>())
            .Returns(Medicine(exemptId, unitPrice: 50m, isTaxable: false));
        _stockDeductionService
            .DeductForSaleAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockDeductionLineResult>
            {
                new(taxableId, 1m, [new BatchDeductionDetail(Guid.CreateVersion7(), "B1", 1m, 80m, SellingPrice: 113m)]),
                new(exemptId, 1m, [new BatchDeductionDetail(Guid.CreateVersion7(), "B2", 1m, 30m, SellingPrice: 50m)]),
            });
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(taxableId, 1m, 0m, 0m), new SaleItemInput(exemptId, 1m, 0m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 163m);

        // Act
        var saleId = await _sut.Handle(command, CancellationToken.None);

        // Assert: VAT 13 comes out of the 113 only; 50 is exempt; the parts sum to the total.
        var saved = await _db.Sales.Include(s => s.Items).FirstAsync(s => s.Id == saleId);
        saved.VatAmount.ShouldBe(13m);
        saved.TaxableAmount.ShouldBe(100m);
        saved.ExemptAmount.ShouldBe(50m);
        saved.Items.Single(i => i.MedicineId == exemptId).IsTaxable.ShouldBeFalse();
        await _outbox.Received(1).AddAsync(
            Arg.Is<SaleCompletedIntegrationEvent>(e => e.VatAmount == 13m && e.TotalAmount == 163m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Warn_On_An_Allergy_Recorded_By_Brand_When_The_Cart_Label_Is_The_Generic()
    {
        // Arrange: the cart labels the medicine by its generic (Diclofenac); the customer's allergy is
        // recorded by brand (Voltaren). The check must match the medicine's name as well as its label.
        var medicineId = Guid.CreateVersion7();
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == medicineId), Arg.Any<CancellationToken>())
            .Returns(new MedicineDto(
                Id: medicineId, Name: "Voltaren 50", GenericName: "Diclofenac", CategoryId: null,
                ReorderLevel: 0m, IsControlled: false, TotalQuantityOnHand: 100m, IsArchived: false,
                CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null, UnitPrice: 10m));
        var customerId = StubCustomer(balance: 0m, creditLimit: null);
        _mediator.Send(Arg.Any<GetCustomerAllergiesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new CustomerAllergiesDto(customerId, ["Voltaren"]));
        StubDeductionFor(medicineId, quantity: 1m, unitCostPrice: 5m);
        var command = new CreateSaleCommand(
            CustomerId: customerId,
            Items: [new SaleItemInput(medicineId, 1m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 10m);

        // Act
        var ex = await Should.ThrowAsync<SafetyWarningException>(async () => await _sut.Handle(command, CancellationToken.None));

        // Assert: flagged under the cart label, and nothing was sold.
        ex.Allergy.ShouldNotBeNull();
        ex.Allergy.MatchedMedicines.ShouldBe(["Diclofenac"]);
        await _stockDeductionService.DidNotReceiveWithAnyArgs().DeductForSaleAsync(default!, default);
        (await _db.Sales.CountAsync()).ShouldBe(0);
    }

    // ---- customer credit limit ----------------------------------------------------------------

    private Guid StubCustomer(decimal balance, decimal? creditLimit)
    {
        var customerId = Guid.CreateVersion7();
        _mediator.Send(Arg.Any<GetCustomerAllergiesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new CustomerAllergiesDto(customerId, []));
        _mediator.Send(Arg.Any<GetCustomerCreditStatusQuery>(), Arg.Any<CancellationToken>())
            .Returns(new CustomerCreditStatusDto(customerId, "Ram Thapa", balance, creditLimit));
        return customerId;
    }

    private static CreateSaleCommand CreditSale(Guid customerId, Guid medicineId, bool overrideLimit = false) => new(
        CustomerId: customerId,
        Items: [new SaleItemInput(medicineId, 2m, 10m, 0m)],
        PaymentMethod: null,
        PaymentAmount: 0m,
        Payments: [new SalePaymentInput("credit", 20m)],
        OverrideCreditLimit: overrideLimit);

    [Fact]
    public async Task Credit_Sale_Should_Post_The_Balance_To_The_Customer_Inside_The_Sale()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 70m, creditLimit: 100m);

        var saleId = await _sut.Handle(CreditSale(customerId, medicineId), CancellationToken.None);

        (await _db.Sales.FirstAsync(s => s.Id == saleId)).BalanceDue.ShouldBe(20m);
        await _customerPosting.Received(1).PostSaleAsync(
            Arg.Is<CustomerSalePosting>(p =>
                p.CustomerId == customerId && p.SaleId == saleId && p.BalanceDue == 20m
                && p.PointsRedeemed == 0 && !p.MayExceedCreditLimit && p.BranchId == _branchId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Credit_Sale_Refused_By_The_Customer_Posting_Should_Not_Be_Saved()
    {
        // The limit is checked by Customers under the customer row lock; its 409 must abort the sale.
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 90m, creditLimit: 100m);
        _customerPosting.PostSaleAsync(Arg.Any<CustomerSalePosting>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromException(new CustomException("over the limit", (IEnumerable<string>?)null, System.Net.HttpStatusCode.Conflict)));

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(CreditSale(customerId, medicineId), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        _db.Sales.ShouldBeEmpty();
        await _outbox.DidNotReceive().AddAsync(Arg.Any<SaleCompletedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Authorised_Override_Should_Be_Passed_To_The_Customer_Posting()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 90m, creditLimit: 100m);
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());

        await _sut.Handle(CreditSale(customerId, medicineId, overrideLimit: true), CancellationToken.None);

        _db.Sales.ShouldHaveSingleItem();
        await _customerPosting.Received(1).PostSaleAsync(
            Arg.Is<CustomerSalePosting>(p => p.MayExceedCreditLimit), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Override_Without_The_Permission_Should_Be_Forbidden()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 90m, creditLimit: 100m);
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        // No Sales.OverrideCreditLimit and no approval token: the controls answer 403 approval_required.
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        _saleControls
            .EnsureCreditOverrideAllowedAsync(Arg.Any<decimal>(), Arg.Any<IReadOnlyCollection<string>?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(ValueTask.FromException(new ForbiddenException("Manager approval is required")));
#pragma warning restore CA2012

        await Should.ThrowAsync<ForbiddenException>(() =>
            _sut.Handle(CreditSale(customerId, medicineId, overrideLimit: true), CancellationToken.None).AsTask());
        _db.Sales.ShouldBeEmpty();
        await _customerPosting.DidNotReceive().PostSaleAsync(Arg.Any<CustomerSalePosting>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Fully_Paid_Sale_Without_Redemption_Should_Not_Touch_The_Customer_Account()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 0m, creditLimit: null);
        var command = new CreateSaleCommand(
            customerId, [new SaleItemInput(medicineId, 2m, 10m, 0m)], null, 0m, Payments: [new SalePaymentInput("cash", 20m)]);

        await _sut.Handle(command, CancellationToken.None);

        await _customerPosting.DidNotReceiveWithAnyArgs().PostSaleAsync(default!, default);
    }

    [Fact]
    public async Task Payments_Must_Match_The_Total_To_The_Paisa()
    {
        // 2 x 10 = 20.00; 19.99 used to be accepted within a 0.01 tolerance.
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var command = new CreateSaleCommand(
            null, [new SaleItemInput(medicineId, 2m, 10m, 0m)], null, 0m, Payments: [new SalePaymentInput("cash", 19.99m)]);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
        _db.Sales.ShouldBeEmpty();
    }

    // ---- loyalty redemption ---------------------------------------------------------------------

    private Guid StubMember(int points, bool isMember = true, bool programmeOn = true)
    {
        var customerId = StubCustomer(balance: 0m, creditLimit: null);
        _mediator.Send(Arg.Any<FSH.Modules.Reference.Contracts.v1.TenantSettings.GetTenantSettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new Dictionary<string, string> { ["loyalty.enabled"] = programmeOn ? "true" : "false", ["loyalty.point_value"] = "1" });
        _mediator.Send(Arg.Any<FSH.Modules.Customers.Contracts.v1.Loyalty.GetCustomerLoyaltyStatusQuery>(), Arg.Any<CancellationToken>())
            .Returns(new CustomerLoyaltyStatusDto(customerId, isMember, points));
        return customerId;
    }

    /// <summary>Two units at 10 = 20, with <paramref name="discount"/> off, paid in cash.</summary>
    private static CreateSaleCommand RedeemSale(Guid customerId, Guid medicineId, int points, decimal discount) => new(
        CustomerId: customerId,
        Items: [new SaleItemInput(medicineId, 2m, 10m, discount)],
        PaymentMethod: null,
        PaymentAmount: 0m,
        Payments: [new SalePaymentInput("cash", 20m - discount)],
        RedeemLoyaltyPoints: points);

    [Fact]
    public async Task Redeeming_Points_Should_Record_Them_On_The_Sale_And_The_Event()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubMember(points: 50);

        var saleId = await _sut.Handle(RedeemSale(customerId, medicineId, points: 5, discount: 5m), CancellationToken.None);

        (await _db.Sales.FirstAsync(s => s.Id == saleId)).LoyaltyPointsRedeemed.ShouldBe(5);
        await _outbox.Received(1).AddAsync(
            Arg.Is<SaleCompletedIntegrationEvent>(e => e.LoyaltyPointsRedeemed == 5), Arg.Any<CancellationToken>());
        // The points come off the customer inside the sale's transaction (no double spend by a concurrent sale).
        await _customerPosting.Received(1).PostSaleAsync(
            Arg.Is<CustomerSalePosting>(p => p.PointsRedeemed == 5 && p.BalanceDue == 0m), Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(50, true, false)]  // programme off
    [InlineData(50, false, true)]  // not a member
    [InlineData(3, true, true)]    // not enough points
    public async Task Redemption_Should_Be_Refused_When_Not_Allowed(int held, bool isMember, bool programmeOn)
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubMember(held, isMember, programmeOn);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            _sut.Handle(RedeemSale(customerId, medicineId, points: 5, discount: 5m), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        _db.Sales.ShouldBeEmpty();
    }

    [Fact]
    public async Task Redemption_Without_The_Matching_Discount_Should_Be_Refused()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubMember(points: 50);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            _sut.Handle(RedeemSale(customerId, medicineId, points: 5, discount: 0m), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
    }

    private static MedicineDto Medicine(Guid id, decimal unitPrice, bool isTaxable) => new(
        Id: id, Name: "Medicine " + id.ToString("N")[..6], GenericName: null, CategoryId: null,
        ReorderLevel: 0m, IsControlled: false, TotalQuantityOnHand: 100m, IsArchived: false,
        CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null, UnitPrice: unitPrice, IsTaxable: isTaxable);

    [Fact]
    public async Task Handle_Should_Return_The_Existing_Sale_When_The_Checkout_Key_Is_Replayed()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 1m, unitCostPrice: 5m);
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 1m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 10m,
            ClientRequestId: "checkout-key-1");

        var first = await _sut.Handle(command, CancellationToken.None);
        var replay = await _sut.Handle(command, CancellationToken.None);

        replay.ShouldBe(first);
        (await _db.Sales.CountAsync()).ShouldBe(1);
        (await _db.Sales.SingleAsync()).ClientRequestId.ShouldBe("checkout-key-1");
        await _stockDeductionService.Received(1).DeductForSaleAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>());
        await _outbox.Received(1).AddAsync(Arg.Any<SaleCompletedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Refuse_An_Inactive_Or_Deleted_Customer_Before_Touching_Stock()
    {
        var customerId = Guid.CreateVersion7();
        _mediator.Send(Arg.Is<GetCustomerCreditStatusQuery>(q => q.CustomerId == customerId), Arg.Any<CancellationToken>())
            .Returns<CustomerCreditStatusDto?>(_ => throw new CustomException("Customer Ram is inactive.", (IEnumerable<string>?)null, System.Net.HttpStatusCode.Conflict));
        var command = new CreateSaleCommand(
            CustomerId: customerId,
            Items: [new SaleItemInput(Guid.CreateVersion7(), 1m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 10m);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        await _stockDeductionService.DidNotReceiveWithAnyArgs().DeductForSaleAsync(default!, default);
        (await _db.Sales.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_Charge_Each_Batch_Its_Own_Price_And_Share_The_Discount()
    {
        var medicineId = Guid.CreateVersion7();
        var lotA = Guid.CreateVersion7();
        var lotB = Guid.CreateVersion7();
        _stockDeductionService.DeductForSaleAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockDeductionLineResult>
            {
                new(medicineId, 3m,
                [
                    new BatchDeductionDetail(lotA, "A", 1m, 5m, SellingPrice: 10m),
                    new BatchDeductionDetail(lotB, "B", 2m, 6m, SellingPrice: 20m),
                ]),
            });
        // Gross 10 + 40 = 50, less an absolute discount of 5 shared 1 : 4 between the lots.
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 3m, 999m, 5m)],
            PaymentMethod: "Cash",
            PaymentAmount: 45m);

        var saleId = await _sut.Handle(command, CancellationToken.None);

        var saved = await _db.Sales.Include(s => s.Items).FirstAsync(s => s.Id == saleId);
        saved.Items.Count.ShouldBe(2);
        var a = saved.Items.Single(i => i.BatchId == lotA);
        var b = saved.Items.Single(i => i.BatchId == lotB);
        (a.Quantity, a.UnitPrice, a.DiscountAmount, a.BatchNo).ShouldBe((1m, 10m, 1m, "A"));
        (b.Quantity, b.UnitPrice, b.DiscountAmount, b.BatchNo).ShouldBe((2m, 20m, 4m, "B"));
        saved.TotalAmount.ShouldBe(45m);
        await _outbox.Received(1).AddAsync(
            Arg.Is<SaleCompletedIntegrationEvent>(e => e.TotalCost == 17m), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Refuse_A_Batch_With_No_Selling_Price()
    {
        var medicineId = Guid.CreateVersion7();
        _stockDeductionService.DeductForSaleAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockDeductionLineResult>
            {
                new(medicineId, 1m, [new BatchDeductionDetail(Guid.CreateVersion7(), "NOPRICE", 1m, 5m, SellingPrice: 0m)]),
            });
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 1m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 10m);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.Message.ShouldContain("NOPRICE");
        (await _db.Sales.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_Give_Two_Cart_Lines_Of_The_Same_Medicine_Their_Own_Batches()
    {
        var medicineId = Guid.CreateVersion7();
        _stockDeductionService.DeductForSaleAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockDeductionLineResult>
            {
                new(medicineId, 1m, [new BatchDeductionDetail(Guid.CreateVersion7(), "FIRST", 1m, 5m, SellingPrice: 10m)]),
                new(medicineId, 1m, [new BatchDeductionDetail(Guid.CreateVersion7(), "SECOND", 1m, 7m, SellingPrice: 12m)]),
            });
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 1m, 10m, 0m), new SaleItemInput(medicineId, 1m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 22m);

        var saleId = await _sut.Handle(command, CancellationToken.None);

        var saved = await _db.Sales.Include(s => s.Items).FirstAsync(s => s.Id == saleId);
        saved.Items.Select(i => (i.BatchNo, i.UnitPrice, i.UnitCostPrice)).OrderBy(x => x.BatchNo)
            .ShouldBe([("FIRST", 10m, 5m), ("SECOND", 12m, 7m)]);
    }

    [Fact]
    public async Task Handle_Should_Round_Each_Batch_Cost_To_The_Paisa_Before_Costing_The_Sale()
    {
        var medicineId = Guid.CreateVersion7();
        var result = new StockDeductionLineResult(medicineId, 3m,
        [
            new BatchDeductionDetail(Guid.CreateVersion7(), "B1", 1m, 1.005m, SellingPrice: 10m),
            new BatchDeductionDetail(Guid.CreateVersion7(), "B2", 2m, 1.00m, SellingPrice: 10m),
        ]);
        _stockDeductionService.DeductForSaleAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockDeductionLineResult> { result });
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 3m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 30m);

        var saleId = await _sut.Handle(command, CancellationToken.None);

        // One sale line per batch, each at its own cost rounded to the paisa (the stored figure that a return
        // or cancellation reverses), and the posted cost is built from those same figures.
        var saved = await _db.Sales.Include(s => s.Items).FirstAsync(s => s.Id == saleId);
        saved.Items.Select(i => (i.BatchNo, i.UnitCostPrice)).OrderBy(x => x.BatchNo)
            .ShouldBe([("B1", 1.01m), ("B2", 1.00m)]);
        await _outbox.Received(1).AddAsync(
            Arg.Is<SaleCompletedIntegrationEvent>(e => e.TotalCost == 3.01m), Arg.Any<CancellationToken>());
    }

    private static MedicineDto StripMedicine(Guid id, int? unitsPerPack = 10) => new(
        Id: id, Name: "Paracetamol 500mg", GenericName: null, CategoryId: null,
        ReorderLevel: 0m, IsControlled: false, TotalQuantityOnHand: 100m, IsArchived: false,
        CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null, UnitPrice: 11.30m, Form: "Tablet",
        UnitsPerPack: unitsPerPack, UnitLabel: "Strip");

    [Fact]
    public async Task Pack_Sale_Should_Deduct_Price_And_Tax_In_Base_Units_And_Record_The_Pack()
    {
        // 2 strips of 10 tablets at Rs 11.30 a tablet (13% VAT inclusive): 20 tablets, Rs 226, VAT 26.
        var medicineId = Guid.CreateVersion7();
        _mediator.Send(Arg.Any<GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PharmacySettingsDto(Guid.CreateVersion7(), "Test Pharmacy", null, null, null, "NPR", 13m, "INV", 1, null));
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == medicineId), Arg.Any<CancellationToken>())
            .Returns(StripMedicine(medicineId));
        _stockDeductionService.DeductForSaleAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockDeductionLineResult>
            {
                new(medicineId, 20m, [new BatchDeductionDetail(Guid.CreateVersion7(), "B1", 20m, 8m, SellingPrice: 11.30m)]),
            });
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 20m, SaleUnit: "pack", PackCount: 2)],
            PaymentMethod: "Cash",
            PaymentAmount: 226m);

        var saleId = await _sut.Handle(command, CancellationToken.None);

        await _stockDeductionService.Received(1).DeductForSaleAsync(
            Arg.Is<StockDeductionRequest>(r => r.Lines.Single().Quantity == 20m), Arg.Any<CancellationToken>());
        var saved = await _db.Sales.Include(s => s.Items).FirstAsync(s => s.Id == saleId);
        var line = saved.Items.Single();
        (line.Quantity, line.UnitPrice, line.SoldUnitsPerPack, line.SoldPackLabel, line.BaseUnitLabel)
            .ShouldBe((20m, 11.30m, (int?)10, "strip", "tablet"));
        line.PackQuantity.ShouldBe(2m);
        saved.TotalAmount.ShouldBe(226m);
        saved.VatAmount.ShouldBe(26m);
        await _outbox.Received(1).AddAsync(
            Arg.Is<SaleCompletedIntegrationEvent>(e =>
                e.TotalAmount == 226m && e.VatAmount == 26m && e.TotalCost == 160m && e.Lines.Single().Quantity == 20m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Base_Unit_Sale_Should_Record_No_Pack()
    {
        var medicineId = Guid.CreateVersion7();
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == medicineId), Arg.Any<CancellationToken>())
            .Returns(StripMedicine(medicineId));
        StubDeductionFor(medicineId, quantity: 3m, unitCostPrice: 5m);
        var command = new CreateSaleCommand(
            CustomerId: null, Items: [new SaleItemInput(medicineId, 3m)], PaymentMethod: "Cash", PaymentAmount: 30m);

        var saleId = await _sut.Handle(command, CancellationToken.None);

        var line = (await _db.Sales.Include(s => s.Items).FirstAsync(s => s.Id == saleId)).Items.Single();
        line.SoldUnitsPerPack.ShouldBeNull();
        line.SoldPackLabel.ShouldBeNull();
        line.PackQuantity.ShouldBeNull();
    }

    [Theory]
    [InlineData(15, 2, 10)] // 2 strips of 10 is 20 tablets, not 15
    [InlineData(20, 2, null)] // no pack size on the medicine
    [InlineData(20, 1, 10)] // 1 strip is 10 tablets, not 20
    public async Task Pack_Sale_Should_Be_Refused_Before_Stock_When_It_Is_Not_Whole_Packs(
        int quantity, int packCount, int? unitsPerPack)
    {
        var medicineId = Guid.CreateVersion7();
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == medicineId), Arg.Any<CancellationToken>())
            .Returns(StripMedicine(medicineId, unitsPerPack));
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, quantity, SaleUnit: "pack", PackCount: packCount)],
            PaymentMethod: "Cash",
            PaymentAmount: 100m);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
        await _stockDeductionService.DidNotReceiveWithAnyArgs().DeductForSaleAsync(default!, default);
        (await _db.Sales.CountAsync()).ShouldBe(0);
    }

    [Theory]
    [InlineData(null, null, 20, true)]
    [InlineData("base", null, 20, true)]
    [InlineData("pack", 2, 20, true)]
    [InlineData("PACK", 2, 20, true)]
    [InlineData("pack", null, 20, false)] // pack line without a pack count
    [InlineData("pack", 0, 20, false)]
    [InlineData(null, 2, 20, false)] // pack count on a base-unit line
    [InlineData("box", 2, 20, false)] // unknown unit
    [InlineData("pack", 2, 20.5, false)] // a pack line is whole base units
    public void Validator_Should_Check_The_Sale_Unit_Fields(string? unit, int? packCount, double quantity, bool valid)
    {
        var validator = new CreateSaleCommandValidator();
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(Guid.CreateVersion7(), (decimal)quantity, SaleUnit: unit, PackCount: packCount)],
            PaymentMethod: "Cash",
            PaymentAmount: 10m);

        validator.Validate(command).IsValid.ShouldBe(valid);
    }

    [Theory]
    [InlineData(1.2345, 10, true)]
    [InlineData(1.234, 10.005, true)]
    [InlineData(1.234, 10.05, false)]
    public void Validator_Should_Enforce_Quantity_And_Money_Precision(double quantity, double amount, bool invalid)
    {
        var validator = new CreateSaleCommandValidator();
        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(Guid.CreateVersion7(), (decimal)quantity, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: (decimal)amount);

        validator.Validate(command).IsValid.ShouldBe(!invalid);
    }

    public void Dispose() => _db.Dispose();

    /// <summary>Stub policy that always rejects, so the guard's ordering can be asserted without
    /// fighting NSubstitute's ValueTask setup.</summary>
    private sealed class RejectingDispensingSafetyPolicy : IDispensingSafetyPolicy
    {
        public ValueTask EnsureDispensableAsync(
            IReadOnlyList<DispenseCheckLine> lines, Guid? prescriptionId, Guid customerId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromException(new DispensingSafetyException("requires a prescription"));

        public ValueTask RecordDispenseAsync(
            Guid prescriptionId, IReadOnlyList<DispenseCheckLine> lines, CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;
    }
}
