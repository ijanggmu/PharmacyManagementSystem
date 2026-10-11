using FSH.Framework.Core.Context;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantStatus;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using FSH.Modules.Reference.Contracts.v1.Dashboard;
using FSH.Modules.Reference.Features.v1.Dashboard.GetDashboardContext;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Framework.Shared.Persistence;
using Mediator;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Reference.Tests.Features.Dashboard;

public sealed class GetDashboardContextQueryHandlerTests
{
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IBranchService _branchService = Substitute.For<IBranchService>();
    private readonly GetDashboardContextQueryHandler _sut;

    public GetDashboardContextQueryHandlerTests()
    {
        _sut = new GetDashboardContextQueryHandler(_currentUser, _mediator, _branchService);
    }

    [Fact]
    public async Task Handle_Should_Compose_Notification_Counts_From_Every_Underlying_Module_Query()
    {
        var userId = Guid.CreateVersion7();
        _currentUser.GetUserId().Returns(userId);
        _currentUser.Name.Returns("Jane Doe");
        _currentUser.GetUserEmail().Returns("jane@example.com");
        _currentUser.GetTenant().Returns("acme");

        _mediator.Send(Arg.Is<GetTenantStatusQuery>(q => q.TenantId == "acme"), Arg.Any<CancellationToken>())
            .Returns(new TenantStatusDto { Id = "acme", Name = "Acme Pharmacy", AdminEmail = "admin@acme.com", Plan = "pro" });
        _mediator.Send(Arg.Any<GetReorderSuggestionsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ReorderSuggestionDto> { new(Guid.CreateVersion7(), "Paracetamol", 10m, 2m, 8m) });
        _mediator.Send(Arg.Any<GetExpiringBatchesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ExpiringBatchDto>());
        _mediator.Send(Arg.Any<GetPrescriptionStatsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PrescriptionStatsDto(20, 4, 2, 13, 1));
        _mediator.Send(Arg.Any<SearchReturnsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResponse<SaleReturnDto> { TotalCount = 3 });
        _mediator.Send(Arg.Any<SearchRefundsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResponse<SaleRefundDto> { TotalCount = 2 });
        _branchService.GetAllForCurrentTenantAsync(Arg.Any<CancellationToken>()).Returns(new List<BranchDto>
        {
            new() { Id = Guid.CreateVersion7(), Name = "Main", Code = "MAIN", IsActive = true },
            new() { Id = Guid.CreateVersion7(), Name = "Uptown", Code = "UP", IsActive = true },
            new() { Id = Guid.CreateVersion7(), Name = "Closed", Code = "OLD", IsActive = false },
        });

        var result = await _sut.Handle(new GetDashboardContextQuery(), CancellationToken.None);

        result.UserId.ShouldBe(userId);
        result.UserName.ShouldBe("Jane Doe");
        result.UserEmail.ShouldBe("jane@example.com");
        result.TenantId.ShouldBe("acme");
        result.TenantName.ShouldBe("Acme Pharmacy");
        result.TenantPlan.ShouldBe("pro");
        result.LowStockCount.ShouldBe(1);
        result.ExpiringCount.ShouldBe(0);
        result.PendingPrescriptionsCount.ShouldBe(4);
        result.PendingReturnsCount.ShouldBe(3);
        result.PendingRefundsCount.ShouldBe(2);
        result.BranchCount.ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_Report_Zero_Branches_When_Tenant_Has_None()
    {
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        _currentUser.Name.Returns("Jane Doe");
        _currentUser.GetTenant().Returns("acme");
        _mediator.Send(Arg.Any<GetTenantStatusQuery>(), Arg.Any<CancellationToken>())
            .Returns(new TenantStatusDto { Id = "acme", Name = "Acme Pharmacy", AdminEmail = "admin@acme.com", Plan = "pro" });
        _mediator.Send(Arg.Any<GetReorderSuggestionsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ReorderSuggestionDto>());
        _mediator.Send(Arg.Any<GetExpiringBatchesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ExpiringBatchDto>());
        _mediator.Send(Arg.Any<GetPrescriptionStatsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PrescriptionStatsDto(0, 0, 0, 0, 0));
        _mediator.Send(Arg.Any<SearchReturnsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResponse<SaleReturnDto> { TotalCount = 0 });
        _mediator.Send(Arg.Any<SearchRefundsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResponse<SaleRefundDto> { TotalCount = 0 });
        _branchService.GetAllForCurrentTenantAsync(Arg.Any<CancellationToken>()).Returns(new List<BranchDto>());

        var result = await _sut.Handle(new GetDashboardContextQuery(), CancellationToken.None);

        result.BranchCount.ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_Skip_Tenant_Status_When_User_Has_No_Tenant()
    {
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        _currentUser.Name.Returns("Root Admin");
        _currentUser.GetTenant().Returns((string?)null);

        _mediator.Send(Arg.Any<GetReorderSuggestionsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ReorderSuggestionDto>());
        _mediator.Send(Arg.Any<GetExpiringBatchesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ExpiringBatchDto>());
        _mediator.Send(Arg.Any<GetPrescriptionStatsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PrescriptionStatsDto(0, 0, 0, 0, 0));
        _mediator.Send(Arg.Any<SearchReturnsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResponse<SaleReturnDto> { TotalCount = 0 });
        _mediator.Send(Arg.Any<SearchRefundsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResponse<SaleRefundDto> { TotalCount = 0 });

        var result = await _sut.Handle(new GetDashboardContextQuery(), CancellationToken.None);

        result.TenantId.ShouldBe(string.Empty);
        result.TenantName.ShouldBeNull();
        result.TenantPlan.ShouldBeNull();
        result.BranchCount.ShouldBe(0);
        await _mediator.DidNotReceive().Send(Arg.Any<GetTenantStatusQuery>(), Arg.Any<CancellationToken>());
        await _branchService.DidNotReceive().GetAllForCurrentTenantAsync(Arg.Any<CancellationToken>());
    }
}
