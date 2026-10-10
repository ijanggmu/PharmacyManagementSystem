using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Expenses.SearchExpenses;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Accounting.Tests.Features.Expenses;

/// <summary>Expenses are dated at midnight, so many share a date: paging must still never repeat or skip one.</summary>
public sealed class SearchExpensesPagingTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Paging_Should_CoverEverySameDayExpense_Once()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns((Guid?)null);
        var day = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        for (int i = 1; i <= 5; i++)
        {
            _db.Expenses.Add(Expense.Create(day, "rent", i, "cash", null, "tester", receiptReference: $"R-{i}"));
        }

        await _db.SaveChangesAsync();
        var sut = new SearchExpensesQueryHandler(_db, _currentBranch);

        var ids = new List<Guid>();
        for (int page = 1; page <= 3; page++)
        {
            var result = await sut.Handle(new SearchExpensesQuery(PageNumber: page, PageSize: 2), CancellationToken.None);
            result.TotalCount.ShouldBe(5);
            ids.AddRange(result.Items.Select(e => e.Id));
        }

        ids.Count.ShouldBe(5);
        ids.Distinct().Count().ShouldBe(5);
    }
}
