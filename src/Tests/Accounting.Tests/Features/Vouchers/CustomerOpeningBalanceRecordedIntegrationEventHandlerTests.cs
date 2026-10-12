using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Customers.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

public sealed class CustomerOpeningBalanceRecordedIntegrationEventHandlerTests
{
    private static readonly Guid ArAccountId = Guid.CreateVersion7();
    private static readonly Guid EquityAccountId = Guid.CreateVersion7();

    private static (CustomerOpeningBalanceRecordedIntegrationEventHandler Handler, IVoucherPostingService Posting) CreateHandler()
    {
        var posting = Substitute.For<IVoucherPostingService>();
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable, Arg.Any<CancellationToken>()).Returns(ArAccountId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, Arg.Any<CancellationToken>()).Returns(EquityAccountId);
        return (new CustomerOpeningBalanceRecordedIntegrationEventHandler(posting, resolver), posting);
    }

    private static CustomerOpeningBalanceRecordedIntegrationEvent Event(decimal amount, Guid? branchId = null) =>
        new(Guid.NewGuid(), new DateTime(2026, 10, 1, 4, 0, 0, DateTimeKind.Utc), "test-tenant", "corr", "Customers",
            LedgerEntryId: Guid.CreateVersion7(), CustomerId: Guid.CreateVersion7(), CustomerName: "Sita",
            Amount: amount, BranchId: branchId);

    [Fact]
    public async Task Receivable_Should_Debit_AR_And_Credit_Equity_At_The_Entry_Date_And_Branch()
    {
        var (handler, posting) = CreateHandler();
        var branchId = Guid.CreateVersion7();
        var @event = Event(1200m, branchId);

        await handler.HandleAsync(@event);

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.ReferenceType == CustomerOpeningBalanceRecordedIntegrationEventHandler.ReferenceType
                && r.ReferenceId == @event.LedgerEntryId
                && r.BranchId == branchId
                && r.VoucherDateUtc == @event.OccurredOnUtc
                && r.Lines.Count == 2
                && r.Lines.Any(l => l.AccountId == ArAccountId && l.DebitAmount == 1200m && l.CreditAmount == 0m)
                && r.Lines.Any(l => l.AccountId == EquityAccountId && l.DebitAmount == 0m && l.CreditAmount == 1200m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Advance_Should_Debit_Equity_And_Credit_AR()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(-300m));

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.Lines.Any(l => l.AccountId == EquityAccountId && l.DebitAmount == 300m && l.CreditAmount == 0m)
                && r.Lines.Any(l => l.AccountId == ArAccountId && l.DebitAmount == 0m && l.CreditAmount == 300m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Zero_Should_Post_Nothing()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(0m));

        await posting.DidNotReceiveWithAnyArgs().PostSystemVoucherAsync(default!, default);
    }
}
