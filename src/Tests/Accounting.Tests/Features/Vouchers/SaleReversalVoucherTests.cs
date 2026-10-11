using NSubstitute;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Sales.Contracts.Events;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>
/// Return/refund vouchers: revenue reversed net of VAT, output VAT reversed, and the money credited to
/// where it actually went (cash / bank / customer account), always balanced. Older events (no settlement
/// split) keep the original Dr 4100 / Cr Cash posting.
/// </summary>
public sealed class SaleReversalVoucherTests
{
    private readonly IVoucherPostingService _posting = Substitute.For<IVoucherPostingService>();
    private readonly FakeResolver _accounts = new();
    private Dictionary<Guid, string> _codeById => _accounts.CodeById;

    private PostVoucherRequest? _posted => _posting.ReceivedCalls()
        .Where(c => c.GetMethodInfo().Name == nameof(IVoucherPostingService.PostSystemVoucherAsync))
        .Select(c => (PostVoucherRequest)c.GetArguments()[0]!)
        .SingleOrDefault();

    private Dictionary<string, (decimal Debit, decimal Credit)> PostedByCode()
    {
        _posted.ShouldNotBeNull();
        _posted.Lines.Sum(l => l.DebitAmount).ShouldBe(_posted.Lines.Sum(l => l.CreditAmount));
        return _posted.Lines
            .GroupBy(l => _codeById[l.AccountId])
            .ToDictionary(g => g.Key, g => (g.Sum(l => l.DebitAmount), g.Sum(l => l.CreditAmount)));
    }

    [Fact]
    public async Task Return_Should_Reverse_Vat_And_Credit_AR_And_Cash_Per_Settlement()
    {
        var evt = new ReturnCompletedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "t", "c", "Sales", Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(),
            TotalReturnAmount: 113m, Lines: [new ReturnCompletedLine(Guid.CreateVersion7(), 1m, 60m)],
            CustomerId: Guid.CreateVersion7(), VatAmount: 13m, CashAmount: 33m, BankAmount: 0m, OnAccountAmount: 80m,
            SaleTotalAmount: 226m);

        await new ReturnCompletedIntegrationEventHandler(_posting, _accounts).HandleAsync(evt);

        var byCode = PostedByCode();
        byCode[AccountingSystemAccountCodes.SalesReturnsAndAllowances].ShouldBe((100m, 0m));
        byCode[AccountingSystemAccountCodes.VatPayable].ShouldBe((13m, 0m));
        byCode[AccountingSystemAccountCodes.Cash].ShouldBe((0m, 33m));
        byCode[AccountingSystemAccountCodes.AccountsReceivable].ShouldBe((0m, 80m));
        byCode[AccountingSystemAccountCodes.Inventory].ShouldBe((60m, 0m));
        byCode[AccountingSystemAccountCodes.CostOfGoodsSold].ShouldBe((0m, 60m));
    }

    [Fact]
    public async Task Legacy_Return_Event_Should_Keep_The_Old_Posting()
    {
        var evt = new ReturnCompletedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "t", "c", "Sales", Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(),
            TotalReturnAmount: 50m, Lines: []);

        await new ReturnCompletedIntegrationEventHandler(_posting, _accounts).HandleAsync(evt);

        var byCode = PostedByCode();
        byCode[AccountingSystemAccountCodes.SalesReturnsAndAllowances].ShouldBe((50m, 0m));
        byCode[AccountingSystemAccountCodes.Cash].ShouldBe((0m, 50m));
    }

    [Fact]
    public async Task Refund_Should_Reverse_Vat_Credit_Bank_And_Book_The_Fee()
    {
        var evt = new RefundCompletedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "t", "c", "Sales", Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(),
            NetRefundAmount: 108m, CustomerId: null, GrossRefundAmount: 113m, VatAmount: 13m, ProcessingFeeRetained: 5m,
            CashAmount: 0m, BankAmount: 108m, OnAccountAmount: 0m, SaleTotalAmount: 113m, ItemsAmount: 113m);

        await new RefundCompletedIntegrationEventHandler(_posting, _accounts).HandleAsync(evt);

        var byCode = PostedByCode();
        byCode[AccountingSystemAccountCodes.SalesReturnsAndAllowances].ShouldBe((100m, 0m));
        byCode[AccountingSystemAccountCodes.VatPayable].ShouldBe((13m, 0m));
        byCode[AccountingSystemAccountCodes.Bank].ShouldBe((0m, 108m));
        byCode[AccountingSystemAccountCodes.SalesRevenue].ShouldBe((0m, 5m));
        byCode.ShouldNotContainKey(AccountingSystemAccountCodes.Cash);
    }

    private sealed class FakeResolver : IAccountingAccountResolver
    {
        public Dictionary<Guid, string> CodeById { get; } = [];

        public ValueTask<Guid> ResolveByCodeAsync(string code, CancellationToken cancellationToken = default)
        {
            var id = CodeById.FirstOrDefault(kv => kv.Value == code).Key;
            if (id == Guid.Empty)
            {
                id = Guid.CreateVersion7();
                CodeById[id] = code;
            }

            return ValueTask.FromResult(id);
        }
    }
}
