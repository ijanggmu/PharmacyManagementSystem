using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Vouchers.GetVoucherById;
using FSH.Modules.Accounting.Features.v1.Vouchers.SearchVouchers;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>
/// Voucher register search: server-side paging with every filter applied before Skip/Take, the extended status
/// filters (reversed / voided / reversal), the source filter, search, and the reversal links on each row.
/// </summary>
public sealed class SearchVouchersQueryHandlerTests : IDisposable
{
    private static readonly DateTime Day = new(2026, 9, 10, 0, 0, 0, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private AccountingAccount _cash = default!;
    private AccountingAccount _sales = default!;

    public SearchVouchersQueryHandlerTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0));
    }

    public void Dispose() => _db.Dispose();

    private SearchVouchersQueryHandler Sut() => new(_db, _currentBranch);

    private async Task SeedChartAsync()
    {
        _cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset);
        _sales = await AccountingTestChart.AddAsync(_db, "4000", AccountingAccountType.Revenue);
    }

    [Fact]
    public async Task Handle_Should_PageWithTotals_And_NoOverlapBetweenPages()
    {
        await SeedChartAsync();
        for (int i = 1; i <= 7; i++)
        {
            await VoucherSeed.PostedAsync(_db, Day, $"SV-{i:D3}", _cash.Id, _sales.Id, i);
        }

        var page1 = await Sut().Handle(new SearchVouchersQuery(PageNumber: 1, PageSize: 3), CancellationToken.None);
        var page3 = await Sut().Handle(new SearchVouchersQuery(PageNumber: 3, PageSize: 3), CancellationToken.None);
        var page2 = await Sut().Handle(new SearchVouchersQuery(PageNumber: 2, PageSize: 3), CancellationToken.None);

        page1.TotalCount.ShouldBe(7);
        page1.TotalPages.ShouldBe(3);
        page1.Items.Count.ShouldBe(3);
        page3.Items.Count.ShouldBe(1);
        page1.Items.Concat(page2.Items).Concat(page3.Items).Select(v => v.Id).Distinct().Count().ShouldBe(7);
        page1.Items.First().TotalDebit.ShouldBe(page1.Items.First().TotalCredit);
    }

    [Fact]
    public async Task Handle_Should_ListReversal_WithLinksBothWays()
    {
        await SeedChartAsync();
        var sale = await VoucherSeed.PostedAsync(_db, Day, "SV-001", _cash.Id, _sales.Id, 100m);
        var reversal = await VoucherSeed.ReverseAsync(_db, sale, "RV-001", Day.AddDays(1));

        var result = await Sut().Handle(new SearchVouchersQuery(), CancellationToken.None);

        result.TotalCount.ShouldBe(2);
        var rv = result.Items.Single(v => v.Id == reversal.Id);
        rv.ReversesVoucherId.ShouldBe(sale.Id);
        rv.ReversesVoucherNo.ShouldBe("SV-001");
        rv.Status.ShouldBe("Posted");
        var original = result.Items.Single(v => v.Id == sale.Id);
        original.Status.ShouldBe("Void");
        original.ReversedByVoucherId.ShouldBe(reversal.Id);
        original.ReversedByVoucherNo.ShouldBe("RV-001");

        var detail = await new GetVoucherByIdQueryHandler(_db, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>()).Handle(new GetVoucherByIdQuery(sale.Id), CancellationToken.None);
        detail.ReversedByVoucherNo.ShouldBe("RV-001");
        var rvDetail = await new GetVoucherByIdQueryHandler(_db, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>()).Handle(new GetVoucherByIdQuery(reversal.Id), CancellationToken.None);
        rvDetail.ReversesVoucherNo.ShouldBe("SV-001");
    }

    [Theory]
    [InlineData("posted", new[] { "RV-001", "SV-003" })]
    [InlineData("draft", new[] { "DRAFT" })]
    [InlineData("void", new[] { "MJ-002", "SV-001" })]
    [InlineData("reversed", new[] { "SV-001" })]
    [InlineData("voided", new[] { "MJ-002" })]
    [InlineData("reversal", new[] { "RV-001" })]
    [InlineData("REVERSED", new[] { "SV-001" })]
    public async Task Handle_Should_ApplyEveryStatusFilter(string status, string[] expected)
    {
        ArgumentNullException.ThrowIfNull(expected);
        await SeedStatusMixAsync();

        var result = await Sut().Handle(new SearchVouchersQuery(Status: status), CancellationToken.None);

        result.Items.Select(v => v.VoucherNo).OrderBy(n => n, StringComparer.Ordinal).ShouldBe(expected);
        result.TotalCount.ShouldBe(expected.Length);
    }

    [Fact]
    public async Task Handle_Should_MatchReversal_ByOriginalVoucherType()
    {
        await SeedStatusMixAsync();

        var result = await Sut().Handle(new SearchVouchersQuery(VoucherType: "system_sale"), CancellationToken.None);

        result.Items.Select(v => v.VoucherNo).OrderBy(n => n, StringComparer.Ordinal).ShouldBe(["RV-001", "SV-001", "SV-003"]);
    }

    [Fact]
    public async Task Handle_Should_FilterBySource_ServerSide()
    {
        await SeedStatusMixAsync();

        var manual = await Sut().Handle(new SearchVouchersQuery(Source: "manual"), CancellationToken.None);
        var system = await Sut().Handle(new SearchVouchersQuery(Source: "system"), CancellationToken.None);

        manual.Items.Select(v => v.VoucherNo).OrderBy(n => n, StringComparer.Ordinal).ShouldBe(["DRAFT", "MJ-002", "RV-001"]);
        system.Items.Select(v => v.VoucherNo).OrderBy(n => n, StringComparer.Ordinal).ShouldBe(["SV-001", "SV-003"]);
    }

    [Fact]
    public async Task Handle_Should_Search_CaseInsensitively_On_NumberAndNarration()
    {
        await SeedStatusMixAsync();

        var byNo = await Sut().Handle(new SearchVouchersQuery(Search: "rv-0"), CancellationToken.None);
        var byNarration = await Sut().Handle(new SearchVouchersQuery(Search: "REVERSAL OF"), CancellationToken.None);

        byNo.Items.ShouldHaveSingleItem().VoucherNo.ShouldBe("RV-001");
        byNarration.Items.ShouldHaveSingleItem().VoucherNo.ShouldBe("RV-001");
    }

    [Theory]
    [InlineData("posted", null, true)]
    [InlineData("Reversal", "MANUAL", true)]
    [InlineData("archived", null, false)]
    [InlineData(null, "imported", false)]
    public void Validator_Should_Accept_Only_KnownStatusAndSource(string? status, string? source, bool valid)
    {
        var result = new SearchVouchersQueryValidator().Validate(new SearchVouchersQuery(Status: status, Source: source));

        result.IsValid.ShouldBe(valid);
    }

    /// <summary>SV-001 reversed by RV-001, MJ-002 voided outright, SV-003 posted, one draft.</summary>
    private async Task SeedStatusMixAsync()
    {
        await SeedChartAsync();
        var sale = await VoucherSeed.PostedAsync(_db, Day, "SV-001", _cash.Id, _sales.Id, 100m);
        await VoucherSeed.ReverseAsync(_db, sale, "RV-001", Day.AddDays(1));
        var journal = await VoucherSeed.PostedAsync(_db, Day, "MJ-002", _cash.Id, _sales.Id, 20m, "journal", AccountingVoucherSource.Manual);
        await VoucherSeed.VoidAsync(_db, journal, "duplicate");
        await VoucherSeed.PostedAsync(_db, Day.AddDays(2), "SV-003", _cash.Id, _sales.Id, 30m);
        await VoucherSeed.DraftAsync(_db, Day.AddDays(3), _cash.Id, _sales.Id, 5m);
    }
}
