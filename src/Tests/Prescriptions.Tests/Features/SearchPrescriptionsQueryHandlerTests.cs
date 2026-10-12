using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.SearchPrescriptions;
using FSH.Modules.Prescriptions.Services;
using Mediator;
using NSubstitute;

namespace Prescriptions.Tests.Features;

public sealed class SearchPrescriptionsQueryHandlerTests : IDisposable
{
    private static readonly DateOnly Today = new(2026, 10, 1);

    private readonly PrescriptionsDbContext _db = PrescriptionsDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly SearchPrescriptionsQueryHandler _sut;

    private readonly Guid _sitaId = Guid.CreateVersion7();
    private readonly Guid _ramId = Guid.CreateVersion7();

    public SearchPrescriptionsQueryHandlerTests()
    {
#pragma warning disable CA2012 // NSubstitute stub set-up, not a consumed ValueTask
        _mediator.Send(Arg.Any<LookupCustomersQuery>(), Arg.Any<CancellationToken>())
            .Returns(call => new ValueTask<IReadOnlyList<CustomerLookupDto>>(call.Arg<LookupCustomersQuery>().CustomerIds!
                .Select(id => new CustomerLookupDto(id, "Someone", null)).ToList()));
#pragma warning restore CA2012
        GivenCustomerMatches();
        _sut = new SearchPrescriptionsQueryHandler(_db, new PrescriptionNameResolver(_mediator), _mediator);
    }

    private static CustomerDto Customer(Guid id, string name) =>
        new(id, name, null, null, null, 0m, true, DateTime.UtcNow, null);

    private void GivenCustomerMatches(params Guid[] ids)
    {
#pragma warning disable CA2012 // NSubstitute stub set-up, not a consumed ValueTask
        _mediator.Send(Arg.Any<SearchCustomersQuery>(), Arg.Any<CancellationToken>())
            .Returns(_ => new ValueTask<PagedResponse<CustomerDto>>(new PagedResponse<CustomerDto>
            {
                Items = ids.Select(id => Customer(id, "Match")).ToList(),
                PageNumber = 1,
                PageSize = 200,
                TotalCount = ids.Length,
                TotalPages = ids.Length == 0 ? 0 : 1,
            }));
#pragma warning restore CA2012
    }

    private async Task SeedAsync()
    {
        _db.Prescriptions.AddRange(
            Prescription.Create(_sitaId, "Dr. Sharma", Today, Today.AddDays(30), prescriptionNumber: "RX-1001"),
            Prescription.Create(_ramId, "Dr. Koirala", Today.AddDays(-10), Today.AddDays(20), prescriptionNumber: "RX-1002"),
            Prescription.Create(_ramId, "Dr. Sharma", Today.AddDays(-40), Today.AddDays(-5), prescriptionNumber: "RX-2001"));
        await _db.SaveChangesAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Handle_Should_Match_PrescriptionNumber_CaseInsensitively()
    {
        await SeedAsync();

        var result = await _sut.Handle(new SearchPrescriptionsQuery(Search: "rx-100"), CancellationToken.None);

        result.Items.Select(p => p.PrescriptionNumber).ShouldBe(["RX-1001", "RX-1002"], ignoreOrder: true);
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_Match_Prescriber()
    {
        await SeedAsync();

        var result = await _sut.Handle(new SearchPrescriptionsQuery(Search: "koirala"), CancellationToken.None);

        result.Items.Single().PrescriptionNumber.ShouldBe("RX-1002");
    }

    [Fact]
    public async Task Handle_Should_Match_Patient_Through_Customer_Search()
    {
        await SeedAsync();
        GivenCustomerMatches(_sitaId);

        var result = await _sut.Handle(new SearchPrescriptionsQuery(Search: "sita"), CancellationToken.None);

        result.Items.Single().PrescriptionNumber.ShouldBe("RX-1001");
        await _mediator.Received(1).Send(
            Arg.Is<SearchCustomersQuery>(q => q.Search == "sita" && q.PageNumber == 1 && q.PageSize == 200),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Combine_Search_With_DateRange()
    {
        await SeedAsync();

        var result = await _sut.Handle(
            new SearchPrescriptionsQuery(Search: "sharma", DateFrom: Today.AddDays(-15), DateTo: Today),
            CancellationToken.None);

        result.Items.Single().PrescriptionNumber.ShouldBe("RX-1001");
    }

    [Fact]
    public async Task Handle_Should_Not_Query_Customers_When_No_Search()
    {
        await SeedAsync();

        var result = await _sut.Handle(new SearchPrescriptionsQuery(), CancellationToken.None);

        result.TotalCount.ShouldBe(3);
        await _mediator.DidNotReceive().Send(Arg.Any<SearchCustomersQuery>(), Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(-1, false)]
    [InlineData(0, true)]
    public void Validator_Should_Require_DateTo_On_Or_After_DateFrom(int offsetDays, bool valid)
    {
        var validator = new SearchPrescriptionsQueryValidator();

        validator.Validate(new SearchPrescriptionsQuery(DateFrom: Today, DateTo: Today.AddDays(offsetDays))).IsValid.ShouldBe(valid);
    }

    public void Dispose() => _db.Dispose();
}
