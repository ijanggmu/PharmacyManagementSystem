using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Sales.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Sales;

/// <summary>Each sale tender is debited to the account the money is actually in (or still owed from).</summary>
public sealed class SaleTenderAccountTests
{
    private readonly IVoucherPostingService _posting = Substitute.For<IVoucherPostingService>();
    private readonly IAccountingAccountResolver _resolver = Substitute.For<IAccountingAccountResolver>();
    private readonly Dictionary<string, Guid> _accounts = [];

    public SaleTenderAccountTests()
    {
        _resolver.ResolveByCodeAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                string code = ci.ArgAt<string>(0);
                if (!_accounts.TryGetValue(code, out var id))
                {
                    id = Guid.CreateVersion7();
                    _accounts[code] = id;
                }

                return id;
            });
    }

    private async Task<PostVoucherRequest> PostAsync(string method, IReadOnlyList<SaleCompletedPayment>? legs)
    {
        await new SaleCompletedIntegrationEventHandler(_posting, _resolver, TestPaymentAccounts.For(_resolver)).HandleAsync(new SaleCompletedIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Sales", Guid.CreateVersion7(), Guid.CreateVersion7(), null, null,
            method, 113m, 113m, 0m, 13m, 0m, [], legs));

        return _posting.ReceivedCalls().Select(c => c.GetArguments()[0]).OfType<PostVoucherRequest>().Single();
    }

    private decimal DebitTo(PostVoucherRequest request, string code) =>
        _accounts.TryGetValue(code, out var id) ? request.Lines.Where(l => l.AccountId == id).Sum(l => l.DebitAmount) : 0m;

    [Fact]
    public async Task An_Insurance_Tender_Should_Be_Owed_By_The_Insurer_Not_Banked()
    {
        var request = await PostAsync("mixed", [new SaleCompletedPayment("cash", 13m), new SaleCompletedPayment("insurance", 100m)]);

        DebitTo(request, AccountingSystemAccountCodes.Cash).ShouldBe(13m);
        DebitTo(request, AccountingSystemAccountCodes.InsuranceReceivable).ShouldBe(100m);
        DebitTo(request, AccountingSystemAccountCodes.Bank).ShouldBe(0m);
        DebitTo(request, AccountingSystemAccountCodes.AccountsReceivable).ShouldBe(0m);
    }

    [Fact]
    public async Task A_Legacy_Insurance_Sale_Should_Go_To_Insurance_Receivable()
    {
        var request = await PostAsync("insurance", null);

        DebitTo(request, AccountingSystemAccountCodes.InsuranceReceivable).ShouldBe(113m);
        DebitTo(request, AccountingSystemAccountCodes.Bank).ShouldBe(0m);
    }

    [Theory]
    [InlineData("card")]
    [InlineData("esewa")]
    [InlineData("bank")]
    public async Task Card_And_Wallet_Tenders_Should_Still_Go_To_Bank(string method)
    {
        var request = await PostAsync(method, [new SaleCompletedPayment(method, 113m)]);

        DebitTo(request, AccountingSystemAccountCodes.Bank).ShouldBe(113m);
    }
}
