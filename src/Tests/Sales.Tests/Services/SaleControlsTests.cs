using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Identity.Contracts.Approvals;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.Controls;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;
using FSH.Modules.Sales.Features.v1.Sales.CancelSale;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Sales.Tests.Features;
using Shouldly;
using Xunit;

namespace Sales.Tests.Services;

/// <summary>
/// Sales' internal controls: per-role discount caps, and the manager approvals the cashier needs for discounts over
/// the cap, cancelling a sale, refunds above the threshold and credit-limit overrides.
/// </summary>
public sealed class SaleControlsTests : IDisposable
{
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IUserRoleService _userRoles = Substitute.For<IUserRoleService>();
    private readonly IGroupRoleService _groupRoles = Substitute.For<IGroupRoleService>();
    private readonly IApprovalService _approvals = Substitute.For<IApprovalService>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly Guid _userId = Guid.CreateVersion7();

    public SaleControlsTests()
    {
        _currentUser.GetUserId().Returns(_userId);
        _currentUser.GetTenant().Returns("test-tenant");
        _groupRoles.GetUserGroupRolesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns([]);
        StubSettings([]);
        AsRoles("Cashier");
    }

    public void Dispose() => _db.Dispose();

    private void StubSettings(Dictionary<string, string> settings)
    {
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        _mediator.Send(Arg.Any<GetTenantSettingsQuery>(), Arg.Any<CancellationToken>()).Returns(settings);
#pragma warning restore CA2012
    }

    private void AsRoles(params string[] roles) =>
        _userRoles.GetUserRolesAsync(_userId.ToString(), Arg.Any<CancellationToken>())
            .Returns(roles.Select(r => new UserRoleDto { RoleName = r, Enabled = true })
                .Append(new UserRoleDto { RoleName = "Admin", Enabled = false })
                .ToList());

    private SaleControls CreateSut() => new(_mediator, _userRoles, _groupRoles, _approvals, _currentUser);

    private Task<ApprovalGrantDto?> ReceivedAuthorize(string action) =>
        _approvals.Received(1).AuthorizeAsync(
            Arg.Is<ApprovalRequirement>(r => r.Action == action), Arg.Any<IReadOnlyCollection<string>?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>());

    #region Discount caps

    [Fact]
    public async Task Discount_Within_The_Cashier_Cap_Should_Need_No_Approval()
    {
        await CreateSut().EnsureDiscountWithinCapAsync(new SaleDiscountFigures(5m, 4m), null, "checkout-1", CancellationToken.None);

        await _approvals.DidNotReceiveWithAnyArgs().AuthorizeAsync(default!, default);
    }

    [Fact]
    public async Task Discount_Over_The_Cashier_Cap_Should_Need_An_Approval_Bound_To_The_Checkout()
    {
        string[] tokens = ["apv_x"];

        await CreateSut().EnsureDiscountWithinCapAsync(new SaleDiscountFigures(12.5m, 3m), tokens, "checkout-1", CancellationToken.None);

        await _approvals.Received(1).AuthorizeAsync(
            Arg.Is<ApprovalRequirement>(r => r.Action == ApprovalActions.SaleDiscount && r.Amount == 12.5m && r.TargetRef == "checkout-1"),
            tokens,
            null,
            CancellationToken.None);
    }

    [Fact]
    public async Task Discount_Should_Propagate_The_Approval_Refusal()
    {
        _approvals.AuthorizeAsync(default!, default, default, default).ReturnsForAnyArgs<ApprovalGrantDto?>(_ => throw new ForbiddenException("approval required"));

        await Should.ThrowAsync<ForbiddenException>(() =>
            CreateSut().EnsureDiscountWithinCapAsync(new SaleDiscountFigures(20m, 20m), null, null, CancellationToken.None).AsTask());
    }

    [Theory]
    [InlineData("Pharmacist", 10, false)]
    [InlineData("Pharmacist", 10.5, true)]
    [InlineData("Manager", 90, false)]
    [InlineData("Admin", 100, false)]
    [InlineData("Night shift", 5, false)] // a custom role gets the "other roles" cap (5%)
    [InlineData("Night shift", 6, true)]
    public async Task Discount_Caps_Should_Follow_The_Roles(string role, double percent, bool needsApproval)
    {
        AsRoles(role);

        await CreateSut().EnsureDiscountWithinCapAsync(
            new SaleDiscountFigures((decimal)percent, 0m), null, null, CancellationToken.None);

        int calls = _approvals.ReceivedCalls().Count();
        calls.ShouldBe(needsApproval ? 1 : 0);
    }

    [Fact]
    public async Task Discount_Caps_Should_Come_From_Tenant_Settings()
    {
        StubSettings(new Dictionary<string, string>
        {
            [InternalControlSettings.DiscountCapsKey] = """{"Cashier":{"line":2,"bill":1}}""",
        });

        await CreateSut().EnsureDiscountWithinCapAsync(new SaleDiscountFigures(2m, 1.5m), null, null, CancellationToken.None);

        await ReceivedAuthorize(ApprovalActions.SaleDiscount);
    }

    [Fact]
    public async Task The_Most_Generous_Role_Should_Win()
    {
        AsRoles("Cashier", "Pharmacist", "Basic");

        await CreateSut().EnsureDiscountWithinCapAsync(new SaleDiscountFigures(9m, 9m), null, null, CancellationToken.None);

        await _approvals.DidNotReceiveWithAnyArgs().AuthorizeAsync(default!, default);
    }

    [Fact]
    public void Figures_Should_Measure_Deepest_Line_And_Whole_Bill_Excluding_Loyalty()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 100m, 10m, 0m, 50m); // 10% off
        sale.AddItem(Guid.CreateVersion7(), 2m, 50m, 0m, 0m, 20m);   // none

        SaleDiscountFigures.For(sale).ShouldBe(new SaleDiscountFigures(10m, 5m));
        // 6 of the 10 off was loyalty points: only the line figure is skipped and the bill counts 4 of 200.
        SaleDiscountFigures.For(sale, loyaltyRedemption: 6m).ShouldBe(new SaleDiscountFigures(0m, 2m));
    }

    [Fact]
    public async Task Discount_At_Exactly_The_Cap_Should_Need_No_Approval_Despite_Paisa_Rounding()
    {
        // 5% of 10 x 3.33 = 1.665, stored as 1.67 (5.015%): the half paisa is rounding, not the cashier's discount.
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 10m, 3.33m, 0m, 5m, 2m);
        sale.Items[0].DiscountAmount.ShouldBe(1.67m);

        var figures = SaleDiscountFigures.For(sale);
        figures.ShouldBe(new SaleDiscountFigures(5m, 5m));

        await CreateSut().EnsureDiscountWithinCapAsync(figures, null, "checkout-1", CancellationToken.None);
        await _approvals.DidNotReceiveWithAnyArgs().AuthorizeAsync(default!, default);
    }

    [Fact]
    public async Task Discount_A_Paisa_Beyond_The_Rounding_Should_Still_Need_An_Approval()
    {
        // 1.68 off 33.30 is 5.03% even after allowing for the half-paisa rounding.
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 10m, 3.33m, 1.68m, 0m, 2m);

        await CreateSut().EnsureDiscountWithinCapAsync(SaleDiscountFigures.For(sale), null, "checkout-1", CancellationToken.None);

        await ReceivedAuthorize(ApprovalActions.SaleDiscount);
    }

    #endregion

    #region Void / credit override / refund

    [Fact]
    public async Task Void_Should_Need_Sales_Cancel_Or_An_Approval_For_That_Sale()
    {
        var saleId = Guid.CreateVersion7();

        await CreateSut().EnsureVoidAllowedAsync(saleId, 1234.567m, "INV-1", ["apv_x"], CancellationToken.None);

        await _approvals.Received(1).AuthorizeAsync(
            Arg.Is<ApprovalRequirement>(r => r.Action == ApprovalActions.SaleVoid && r.Amount == 1234.57m && r.TargetRef == saleId.ToString()),
            Arg.Any<IReadOnlyCollection<string>?>(),
            SalesPermissions.Sales.Cancel,
            CancellationToken.None);
    }

    [Fact]
    public async Task Credit_Override_Should_Need_The_Permission_Or_An_Approval()
    {
        await CreateSut().EnsureCreditOverrideAllowedAsync(800m, null, "checkout-9", CancellationToken.None);

        await _approvals.Received(1).AuthorizeAsync(
            Arg.Is<ApprovalRequirement>(r => r.Action == ApprovalActions.CreditOverride && r.Amount == 800m && r.TargetRef == "checkout-9"),
            Arg.Any<IReadOnlyCollection<string>?>(),
            SalesPermissions.Sales.OverrideCreditLimit,
            CancellationToken.None);
    }

    [Fact]
    public async Task Refund_Up_To_The_Threshold_Should_Need_No_Approval()
    {
        await CreateSut().EnsureRefundAllowedAsync(Guid.CreateVersion7(), 1000m, null, CancellationToken.None);

        await _approvals.DidNotReceiveWithAnyArgs().AuthorizeAsync(default!, default);
    }

    [Fact]
    public async Task Refund_Above_The_Threshold_Should_Need_An_Approval_Unless_The_User_May_Approve()
    {
        StubSettings(new Dictionary<string, string> { [InternalControlSettings.RefundApprovalThresholdKey] = "250" });
        var saleId = Guid.CreateVersion7();

        await CreateSut().EnsureRefundAllowedAsync(saleId, 250.01m, null, CancellationToken.None);

        await _approvals.Received(1).AuthorizeAsync(
            Arg.Is<ApprovalRequirement>(r => r.Action == ApprovalActions.SaleRefund && r.TargetRef == saleId.ToString()),
            Arg.Any<IReadOnlyCollection<string>?>(),
            IdentityPermissions.Approvals.Approve,
            CancellationToken.None);
    }

    #endregion

    #region Guarded handlers

    private async Task<Sale> SeedSaleAsync(bool shiftOpen = true)
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 1000m, 0m, 0m, 600m);
        sale.Finalize([new SaleTender("cash", 2000m, null)], shortfallIsOnAccount: false);
        sale.ApplyVat(13m);
        _db.Sales.Add(sale);
        if (shiftOpen)
        {
            // The sale took cash: cancelling it pays that back out of the branch's drawer.
            _db.CashShifts.Add(CashShift.Open(sale.BranchId, "cashier", 0m, null));
        }

        await _db.SaveChangesAsync();
        return sale;
    }

    [Fact]
    public async Task Cancel_Of_A_Cash_Sale_Should_Need_An_Open_Cash_Shift()
    {
        var sale = await SeedSaleAsync(shiftOpen: false);
        var sut = new CancelSaleCommandHandler(
            _db, Substitute.For<IOutboxWriter>(), _currentUser, Substitute.For<ICurrentBranch>(), CreateSut());

        var ex = await Should.ThrowAsync<CustomException>(
            () => sut.Handle(new CancelSaleCommand(sale.Id, "wrong item", ["apv_token"]), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.ErrorMessages.ShouldContain("cash_shift_required");
        _db.ChangeTracker.Clear();
        (await _db.Sales.SingleAsync()).Status.ShouldBe(SaleStatus.Completed);
        // Refused before the approval is spent.
        await _approvals.DidNotReceiveWithAnyArgs().AuthorizeAsync(default!, default, default, default);
    }

    [Fact]
    public async Task Cancel_Of_A_Cash_Sale_Without_A_Shift_Should_Pass_When_The_Tenant_Does_Not_Require_One()
    {
        StubSettings(new Dictionary<string, string> { [InternalControlSettings.RequireOpenShiftKey] = "false" });
        var sale = await SeedSaleAsync(shiftOpen: false);
        var sut = new CancelSaleCommandHandler(
            _db, Substitute.For<IOutboxWriter>(), _currentUser, Substitute.For<ICurrentBranch>(), CreateSut());

        await sut.Handle(new CancelSaleCommand(sale.Id, "wrong item", ["apv_token"]), CancellationToken.None);

        (await _db.Sales.SingleAsync()).Status.ShouldBe(SaleStatus.Cancelled);
    }

    [Fact]
    public async Task Cancel_Without_Approval_Should_Leave_The_Sale_Completed()
    {
        var sale = await SeedSaleAsync();
        _approvals.AuthorizeAsync(default!, default, default, default).ReturnsForAnyArgs<ApprovalGrantDto?>(_ => throw new ForbiddenException("approval required"));
        var sut = new CancelSaleCommandHandler(
            _db, Substitute.For<IOutboxWriter>(), _currentUser, Substitute.For<ICurrentBranch>(), CreateSut());

        await Should.ThrowAsync<ForbiddenException>(() => sut.Handle(new CancelSaleCommand(sale.Id, "wrong item"), CancellationToken.None).AsTask());

        _db.ChangeTracker.Clear();
        (await _db.Sales.SingleAsync()).Status.ShouldNotBe(SaleStatus.Cancelled);
    }

    [Fact]
    public async Task Cancel_With_An_Approval_Should_Cancel_The_Sale()
    {
        var sale = await SeedSaleAsync();
        var sut = new CancelSaleCommandHandler(
            _db, Substitute.For<IOutboxWriter>(), _currentUser, Substitute.For<ICurrentBranch>(), CreateSut());

        await sut.Handle(new CancelSaleCommand(sale.Id, "wrong item", ["apv_token"]), CancellationToken.None);

        (await _db.Sales.SingleAsync()).Status.ShouldBe(SaleStatus.Cancelled);
        await _approvals.Received(1).AuthorizeAsync(
            Arg.Is<ApprovalRequirement>(r => r.TargetRef == sale.Id.ToString()),
            Arg.Is<IReadOnlyCollection<string>?>(t => t!.Single() == "apv_token"),
            SalesPermissions.Sales.Cancel,
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Refund_Above_Threshold_Without_Approval_Should_Not_Be_Recorded()
    {
        var sale = await SeedSaleAsync();
        _approvals.AuthorizeAsync(default!, default, default, default).ReturnsForAnyArgs<ApprovalGrantDto?>(_ => throw new ForbiddenException("approval required"));
        var invoiceNumbers = Substitute.For<IInvoiceNumberService>();
        invoiceNumbers.ResolveContextAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns(new InvoiceNumberContext("INV", "MAIN"));
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        _mediator.Send(Arg.Any<FSH.Modules.Reference.Contracts.v1.Settings.GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new FSH.Modules.Reference.Contracts.Dtos.PharmacySettingsDto(Guid.CreateVersion7(), "Test", null, null, null, "NPR", 13m, "INV", 1, null));
#pragma warning restore CA2012
        var sut = new CreateRefundCommandHandler(
            _db, Substitute.For<IOutboxWriter>(), _currentUser, Substitute.For<ICurrentBranch>(), invoiceNumbers, _mediator, CreateSut());

        var command = new CreateRefundCommand(
            sale.Id, null, DateTime.UtcNow, "defective", [new FSH.Modules.Sales.Contracts.v1.Refunds.RefundItemInput(sale.Items[0].Id, 2m)]);

        await Should.ThrowAsync<ForbiddenException>(() => sut.Handle(command, CancellationToken.None).AsTask());
        _db.ChangeTracker.Clear();
        (await _db.SaleRefunds.CountAsync()).ShouldBe(0);
    }

    #endregion
}
