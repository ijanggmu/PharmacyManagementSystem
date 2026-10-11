using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
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
            _db, _dispensingSafetyPolicy, _userPermissions, _stockDeductionService, _outbox, _mediator, _currentUser, _currentBranch, _invoiceNumbers, NullLogger<CreateSaleCommandHandler>.Instance);
    }

    private void StubDeductionFor(Guid medicineId, decimal quantity, decimal unitCostPrice)
    {
        var batch = new BatchDeductionDetail(Guid.CreateVersion7(), "BATCH-1", quantity, unitCostPrice);
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
            _db, new RejectingDispensingSafetyPolicy(), _userPermissions, _stockDeductionService, _outbox, _mediator, _currentUser, _currentBranch, _invoiceNumbers, NullLogger<CreateSaleCommandHandler>.Instance);
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
                new(taxableId, 1m, [new BatchDeductionDetail(Guid.CreateVersion7(), "B1", 1m, 80m)]),
                new(exemptId, 1m, [new BatchDeductionDetail(Guid.CreateVersion7(), "B2", 1m, 30m)]),
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
    public async Task Credit_Sale_Within_The_Limit_Should_Complete()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 70m, creditLimit: 100m);

        var saleId = await _sut.Handle(CreditSale(customerId, medicineId), CancellationToken.None);

        (await _db.Sales.FirstAsync(s => s.Id == saleId)).BalanceDue.ShouldBe(20m);
    }

    [Fact]
    public async Task Credit_Sale_Over_The_Limit_Should_Be_Refused()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 90m, creditLimit: 100m);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(CreditSale(customerId, medicineId), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.Message.ShouldContain("10.00");
        _db.Sales.ShouldBeEmpty();
    }

    [Fact]
    public async Task Over_The_Limit_With_An_Authorised_Override_Should_Complete()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 90m, creditLimit: 100m);
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());

        await _sut.Handle(CreditSale(customerId, medicineId, overrideLimit: true), CancellationToken.None);

        _db.Sales.ShouldHaveSingleItem();
    }

    [Fact]
    public async Task Override_Without_The_Permission_Should_Be_Forbidden()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 90m, creditLimit: 100m);
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        _userPermissions.HasPermissionAsync(Arg.Any<string>(), SalesPermissions.Sales.OverrideCreditLimit, Arg.Any<CancellationToken>())
            .Returns(false);

        await Should.ThrowAsync<ForbiddenException>(() =>
            _sut.Handle(CreditSale(customerId, medicineId, overrideLimit: true), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Customer_Without_A_Limit_Should_Take_Any_Credit()
    {
        var medicineId = Guid.CreateVersion7();
        StubDeductionFor(medicineId, quantity: 2m, unitCostPrice: 5m);
        var customerId = StubCustomer(balance: 5000m, creditLimit: null);

        await _sut.Handle(CreditSale(customerId, medicineId), CancellationToken.None);

        _db.Sales.ShouldHaveSingleItem();
    }

    private static MedicineDto Medicine(Guid id, decimal unitPrice, bool isTaxable) => new(
        Id: id, Name: "Medicine " + id.ToString("N")[..6], GenericName: null, CategoryId: null,
        ReorderLevel: 0m, IsControlled: false, TotalQuantityOnHand: 100m, IsArchived: false,
        CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null, UnitPrice: unitPrice, IsTaxable: isTaxable);

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
