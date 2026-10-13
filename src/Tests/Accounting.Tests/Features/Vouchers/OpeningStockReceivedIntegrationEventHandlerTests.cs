using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Inventory.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

public sealed class OpeningStockReceivedIntegrationEventHandlerTests
{
    private static readonly Guid InventoryAccountId = Guid.CreateVersion7();
    private static readonly Guid EquityAccountId = Guid.CreateVersion7();

    private static (OpeningStockReceivedIntegrationEventHandler Handler, IVoucherPostingService Posting) CreateHandler()
    {
        var posting = Substitute.For<IVoucherPostingService>();
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, Arg.Any<CancellationToken>()).Returns(InventoryAccountId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, Arg.Any<CancellationToken>()).Returns(EquityAccountId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, Arg.Any<CancellationToken>()).Returns(CashAccountId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Bank, Arg.Any<CancellationToken>()).Returns(BankAccountId);
        return (new OpeningStockReceivedIntegrationEventHandler(posting, resolver, TestPaymentAccounts.For(resolver)), posting);
    }

    private static readonly Guid CashAccountId = Guid.CreateVersion7();
    private static readonly Guid BankAccountId = Guid.CreateVersion7();

    private static OpeningStockReceivedIntegrationEvent Event(decimal amount, Guid? branchId = null, string? funding = null) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "corr", "Inventory", Guid.CreateVersion7(),
            amount, DateTime.UtcNow, "Opening stock for Paracetamol", branchId, funding);

    [Theory]
    [InlineData(null)]
    [InlineData(StockFundingSources.OpeningStock)]
    public async Task HandleAsync_Should_CreditEquity_When_FundedAsOpeningStock(string? funding)
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(300m, funding: funding));

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.VoucherType == "system_opening_stock"
                && r.ReferenceType == "InventoryOpeningStock"
                && r.Lines.Any(l => l.AccountId == InventoryAccountId && l.DebitAmount == 300m)
                && r.Lines.Any(l => l.AccountId == EquityAccountId && l.CreditAmount == 300m)),
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(StockFundingSources.Cash, true)]
    [InlineData("CASH", true)]
    [InlineData(StockFundingSources.Bank, false)]
    public async Task HandleAsync_Should_PostPurchaseAgainstCashOrBank_When_StockWasPaidFor(string funding, bool cash)
    {
        var (handler, posting) = CreateHandler();
        var branchId = Guid.CreateVersion7();
        var @event = Event(450m, branchId, funding);
        Guid moneyAccountId = cash ? CashAccountId : BankAccountId;

        await handler.HandleAsync(@event);

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.VoucherType == "system_purchase"
                && r.ReferenceType == "InventoryStockPurchase"
                && r.ReferenceId == @event.ReceiptId
                && r.BranchId == branchId
                && r.Lines.Count == 2
                && r.Lines.Any(l => l.AccountId == InventoryAccountId && l.DebitAmount == 450m && l.CreditAmount == 0m)
                && r.Lines.Any(l => l.AccountId == moneyAccountId && l.DebitAmount == 0m && l.CreditAmount == 450m)
                && !r.Lines.Any(l => l.AccountId == EquityAccountId)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_DebitInventoryAndCreditEquity()
    {
        var (handler, posting) = CreateHandler();
        var branchId = Guid.CreateVersion7();
        var @event = Event(500m, branchId);

        await handler.HandleAsync(@event);

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.VoucherType == "system_opening_stock"
                && r.ReferenceType == "InventoryOpeningStock"
                && r.ReferenceId == @event.ReceiptId
                && r.BranchId == branchId
                && r.Lines.Count == 2
                && r.Lines.Any(l => l.AccountId == InventoryAccountId && l.DebitAmount == 500m && l.CreditAmount == 0m)
                && r.Lines.Any(l => l.AccountId == EquityAccountId && l.DebitAmount == 0m && l.CreditAmount == 500m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_PostNothing_When_AmountIsZero()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(0m));

        await posting.DidNotReceiveWithAnyArgs().PostSystemVoucherAsync(default!, default);
    }
}
